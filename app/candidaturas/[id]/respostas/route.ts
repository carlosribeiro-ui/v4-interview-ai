import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { getCandidatura, getVaga, upsertRespostaAtomica, atualizarRespostaAtomica } from '@/lib/store';
import { uploadParaR2 } from '@/lib/r2';
import { transcribeAudio } from '@/lib/transcribe';
import { avaliarResposta } from '@/lib/llm';
import { extractarFrames } from '@/lib/video';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';
import { reportarErro } from '@/lib/monitoring';
import { comFila } from '@/lib/queue';
import { lerSessao, extrairCandidaturaId, validarTokenGravacao } from '@/lib/auth';
import type { Resposta } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Tamanho máximo: 50MB */
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

/**
 * FASE 1: Upload + retorna imediatamente (202 Accepted).
 * Auth: session OU candidato token. Fila por candidatura.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Auth check
  const sessao = await lerSessao(req);
  const candidatoId = await extrairCandidaturaId(req);
  if ((!sessao || (sessao.role !== 'admin' && sessao.role !== 'talent')) && candidatoId !== params.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // V-SEC: escopo por candidato/sessão, não por IP — várias pessoas testando da
  // mesma rede (mesmo IP de escritório) não competem pelo mesmo balde de limite.
  const bloqueado = await aplicarRateLimit(req, 'video-upload', LIMITES.videoUpload, sessao?.email || candidatoId || undefined);
  if (bloqueado) return bloqueado;

  const candidaturaId = params.id;

  return comFila(`candidatura:${candidaturaId}`, async () => {
    const candidatura = await getCandidatura(candidaturaId);
    if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

    const vaga = await getVaga(candidatura.vagaId);
    if (!vaga) return NextResponse.json({ error: 'Vaga não encontrada' }, { status: 404 });

    const formData = await req.formData();
    const perguntaId = formData.get('perguntaId');
    const file = formData.get('video');
    const tokenGravacao = formData.get('tokenGravacao');

    if (typeof perguntaId !== 'string' || !(file instanceof File)) {
      return NextResponse.json({ error: 'perguntaId e video são obrigatórios' }, { status: 400 });
    }

    // V-SEC (anti-fraude): exige prova de que a gravação passou pelo fluxo real da tela —
    // fecha a brecha de enviar um vídeo qualquer direto pra API sem nunca ter gravado nada.
    // Ver lib/auth-edge.ts (criarTokenGravacao/validarTokenGravacao).
    if (typeof tokenGravacao !== 'string' || !tokenGravacao) {
      return NextResponse.json({ error: 'Token de gravação ausente — recarregue a página e responda em tempo real' }, { status: 400 });
    }
    const validacaoGravacao = await validarTokenGravacao(tokenGravacao, candidaturaId, perguntaId);
    if (!validacaoGravacao.ok) {
      return NextResponse.json({ error: validacaoGravacao.erro }, { status: 400 });
    }

    // V-08: File size limit
    if (file.size > MAX_VIDEO_SIZE) {
      return NextResponse.json({ error: 'Vídeo excede o limite de 50MB' }, { status: 413 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Arquivo vazio' }, { status: 400 });
    }

    const pergunta = vaga.perguntas.find((p) => p.id === perguntaId);
    if (!pergunta) return NextResponse.json({ error: 'Pergunta não encontrada nesta vaga' }, { status: 404 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // V-SEC: Magic byte validation — não confiar apenas no Content-Type do cliente
    const header = buffer.subarray(0, 12);
    const isMp4 = header.length >= 12 && (
      // ftyp box: bytes 4-7 = 'ftyp'
      (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) ||
      // MP4 sem ftyp (moov/mdat first)
      file.type === 'video/mp4'
    );
    const isWebm = header.length >= 4 && (
      // EBML header: 0x1A 0x45 0xDF 0xA3
      buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3
    );

    if (!isMp4 && !isWebm) {
      return NextResponse.json({ error: 'Arquivo não é um vídeo válido (aceitos: MP4, WebM)' }, { status: 400 });
    }

    const ext = isMp4 ? 'mp4' : 'webm';
    const contentType = ext === 'mp4' ? 'video/mp4' : 'video/webm';
    const tmpPath = path.join(os.tmpdir(), `${randomUUID()}.${ext}`);

    let videoPath: string;
    try {
      await writeFile(tmpPath, buffer);
      const key = `${candidaturaId}/${perguntaId}.${ext}`;
      videoPath = await uploadParaR2(key, buffer, contentType);
    } catch (err: any) {
      return NextResponse.json({ error: 'Erro ao salvar o vídeo' }, { status: 500 });
    }

    const respostaPlaceholder: Resposta = {
      perguntaId,
      videoPath,
      transcricao: '',
      score: 0,
      feedback: '',
      avaliando: true
    };

    await upsertRespostaAtomica(candidaturaId, respostaPlaceholder);

    const curriculoTexto = [candidatura.linkedin, candidatura.curriculoPath].filter(Boolean).join('\n');
    processarRespostaIA(candidaturaId, perguntaId, tmpPath, videoPath, pergunta.texto, pergunta.criterios, vaga, curriculoTexto || undefined)
      .catch(() => {});

    return NextResponse.json({ status: 'processing', perguntaId }, { status: 202 });
  });
}

async function processarRespostaIA(
  candidaturaId: string,
  perguntaId: string,
  tmpPath: string,
  videoPath: string,
  textoPergunta: string,
  criterios: string,
  vaga: { senioridade: string; requisitos: string[]; jobDescription?: string; avaliarIdioma?: boolean },
  curriculoTexto?: string
) {
  try {
    const [transcricao, frames] = await Promise.all([
      transcribeAudio(tmpPath),
      Promise.resolve(extractarFrames(tmpPath))
    ]);

    const avaliacao = await avaliarResposta(
      textoPergunta, criterios, transcricao, vaga.senioridade, vaga.requisitos,
      frames, curriculoTexto, vaga.jobDescription, vaga.avaliarIdioma
    );

    await comFila(`candidatura:${candidaturaId}`, () =>
      atualizarRespostaAtomica(candidaturaId, perguntaId, {
        transcricao, score: avaliacao.score, feedback: avaliacao.feedback,
        pontoAtencao: avaliacao.pontoAtencao, estaLendo: avaliacao.estaLendo,
        confiancaLeitura: avaliacao.confiancaLeitura, qualidadeDiscurso: avaliacao.qualidadeDiscurso,
        qualidadeConteudo: avaliacao.qualidadeConteudo, competenciasEssenciais: avaliacao.competenciasEssenciais,
        competenciasAdicionais: avaliacao.competenciasAdicionais, avaliacaoIdioma: avaliacao.avaliacaoIdioma,
        avaliando: false
      })
    );
  } catch (err) {
    reportarErro(err, { route: '/candidaturas/[id]/respostas', candidaturaId, extra: { perguntaId, fase: 'background' } });
    await comFila(`candidatura:${candidaturaId}`, () =>
      atualizarRespostaAtomica(candidaturaId, perguntaId, {
        transcricao: '', score: 0,
        feedback: 'Erro ao avaliar automaticamente esta resposta. O vídeo foi salvo — tente reenviar ou avalie manualmente.',
        avaliando: false
      })
    );
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/**
 * GET /candidaturas/[id]/respostas?perguntaId=X
 * Auth: session OU candidato token.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await lerSessao(req);
  const candidatoId = await extrairCandidaturaId(req);
  if ((!sessao || (sessao.role !== 'admin' && sessao.role !== 'talent')) && candidatoId !== params.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const perguntaId = req.nextUrl.searchParams.get('perguntaId');
  if (!perguntaId) {
    return NextResponse.json({ error: 'perguntaId é obrigatório' }, { status: 400 });
  }

  const candidatura = await getCandidatura(params.id);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

  const resposta = candidatura.respostas.find((r) => r.perguntaId === perguntaId);
  if (!resposta) {
    return NextResponse.json({ error: 'Resposta não encontrada' }, { status: 404 });
  }

  return NextResponse.json(resposta);
}
