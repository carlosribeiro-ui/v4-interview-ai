import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { getCandidatura, getVaga, saveCandidatura } from '@/lib/store';
import { uploadParaR2 } from '@/lib/r2';
import { transcribeAudio } from '@/lib/transcribe';
import { avaliarResposta } from '@/lib/llm';
import { extractarFrames } from '@/lib/video';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';
import { reportarErro } from '@/lib/monitoring';
import type { Resposta } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * FASE 1: Upload + retorna imediatamente (202 Accepted).
 * O processamento de IA (transcrição + avaliação) acontece em background via
 * waitUntil() — o candidate não fica travado esperando. O frontend faz polling
 * no endpoint GET até `avaliando` virar `false`.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const bloqueado = aplicarRateLimit(req, 'video-upload', LIMITES.videoUpload);
  if (bloqueado) return bloqueado;

  const candidaturaId = params.id;

  const candidatura = await getCandidatura(candidaturaId);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

  const vaga = await getVaga(candidatura.vagaId);
  if (!vaga) return NextResponse.json({ error: 'Vaga não encontrada' }, { status: 404 });

  const formData = await req.formData();
  const perguntaId = formData.get('perguntaId');
  const file = formData.get('video');

  if (typeof perguntaId !== 'string' || !(file instanceof File)) {
    return NextResponse.json({ error: 'perguntaId e video são obrigatórios' }, { status: 400 });
  }

  const pergunta = vaga.perguntas.find((p) => p.id === perguntaId);
  if (!pergunta) return NextResponse.json({ error: 'Pergunta não encontrada nesta vaga' }, { status: 404 });

  const ext = file.type.includes('mp4') ? 'mp4' : 'webm';
  const contentType = file.type || (ext === 'mp4' ? 'video/mp4' : 'video/webm');
  const tmpPath = path.join(os.tmpdir(), `${randomUUID()}.${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());

  let videoPath: string;
  try {
    await writeFile(tmpPath, buffer);
    const key = `${candidaturaId}/${perguntaId}.${ext}`;
    videoPath = await uploadParaR2(key, buffer, contentType);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Erro ao salvar o vídeo' }, { status: 500 });
  }

  // Salva placeholder com avaliando=true — o frontend vê isso e faz polling.
  const respostaPlaceholder: Resposta = {
    perguntaId,
    videoPath,
    transcricao: '',
    score: 0,
    feedback: '',
    avaliando: true
  };

  const fresca = await getCandidatura(candidaturaId);
  if (fresca) {
    fresca.respostas = fresca.respostas.filter((r) => r.perguntaId !== perguntaId);
    fresca.respostas.push(respostaPlaceholder);
    await saveCandidatura(fresca);
  }

  // FASE 2: Processamento em background — fire-and-forget.
  // No Vercel serverless, a função fica viva enquanto houver Promises pendentes
  // no event loop (o Node não congela se há trabalho agendado). O 202 é enviado
  // imediatamente, mas o processamento continua até terminar.
  const curriculoTexto = [fresca?.linkedin, fresca?.curriculoPath].filter(Boolean).join('\n');
  // Não await — fire-and-forget. O erro é capturado dentro de processarRespostaIA.
  processarRespostaIA(candidaturaId, perguntaId, tmpPath, videoPath, pergunta.texto, pergunta.criterios, vaga, curriculoTexto || undefined)
    .catch(() => {}); // Safety net — erros já são tratados dentro da função

  return NextResponse.json({ status: 'processing', perguntaId }, { status: 202 });
}

/**
 * Processa transcrição + avaliação em background. Atualiza a candidatura
 * quando termina — o frontend descobre via polling no endpoint GET.
 */
async function processarRespostaIA(
  candidaturaId: string,
  perguntaId: string,
  tmpPath: string,
  videoPath: string,
  textoPergunta: string,
  criterios: string,
  vaga: { senioridade: string; requisitos: string[]; jobDescription?: string },
  curriculoTexto?: string
) {
  try {
    const [transcricao, frames] = await Promise.all([
      transcribeAudio(tmpPath),
      Promise.resolve(extractarFrames(tmpPath))
    ]);

    const avaliacao = await avaliarResposta(
      textoPergunta,
      criterios,
      transcricao,
      vaga.senioridade,
      vaga.requisitos,
      frames,
      curriculoTexto,
      vaga.jobDescription
    );

    const resposta: Resposta = {
      perguntaId,
      videoPath,
      transcricao,
      score: avaliacao.score,
      feedback: avaliacao.feedback,
      pontoAtencao: avaliacao.pontoAtencao,
      estaLendo: avaliacao.estaLendo,
      confiancaLeitura: avaliacao.confiancaLeitura,
      qualidadeDiscurso: avaliacao.qualidadeDiscurso,
      qualidadeConteudo: avaliacao.qualidadeConteudo,
      competenciasEssenciais: avaliacao.competenciasEssenciais,
      competenciasAdicionais: avaliacao.competenciasAdicionais,
      avaliando: false
    };

    const fresca = await getCandidatura(candidaturaId);
    if (fresca) {
      fresca.respostas = fresca.respostas.filter((r) => r.perguntaId !== perguntaId);
      fresca.respostas.push(resposta);
      fresca.parecer = undefined;
      recalcularScoreSeConcluida(fresca);
      await saveCandidatura(fresca);
    }
  } catch (err) {
    reportarErro(err, {
      route: '/api/candidaturas/[id]/respostas',
      candidaturaId,
      extra: { perguntaId, fase: 'background' }
    });

    const respostaComErro: Resposta = {
      perguntaId,
      videoPath,
      transcricao: '',
      score: 0,
      feedback: 'Erro ao avaliar automaticamente esta resposta. O vídeo foi salvo — tente reenviar ou avalie manualmente.',
      avaliando: false
    };

    const fresca = await getCandidatura(candidaturaId);
    if (fresca) {
      fresca.respostas = fresca.respostas.filter((r) => r.perguntaId !== perguntaId);
      fresca.respostas.push(respostaComErro);
      fresca.parecer = undefined;
      recalcularScoreSeConcluida(fresca);
      await saveCandidatura(fresca);
    }
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/** Só entram na média as respostas já avaliadas — placeholders "avaliando" ainda não contam. */
function recalcularScoreSeConcluida(candidatura: { status: string; respostas: Resposta[]; scoreMedio: number | null }) {
  if (candidatura.status !== 'concluida') return;
  const avaliadas = candidatura.respostas.filter((r) => !r.avaliando);
  candidatura.scoreMedio = avaliadas.length
    ? Math.round((avaliadas.reduce((sum, r) => sum + r.score, 0) / avaliadas.length) * 10) / 10
    : null;
}

/**
 * GET /api/candidaturas/[id]/respostas?perguntaId=X
 * Endpoint de polling — o frontend checa a cada 2s se a resposta já foi processada.
 * Retorna a resposta com `avaliando: false` quando pronta.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
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
