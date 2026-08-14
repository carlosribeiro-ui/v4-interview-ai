import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { getCandidatura, getVaga, upsertRespostaAtomica, atualizarRespostaAtomica } from '@/lib/store';
import { uploadParaR2 } from '@/lib/r2';
import { transcribeAudio } from '@/lib/transcribe';
import { avaliarResposta } from '@/lib/llm';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';
import { reportarErro } from '@/lib/monitoring';
import { comFila } from '@/lib/queue';
import { lerSessao, extrairCandidaturaId, validarTokenGravacao } from '@/lib/auth';
import { analisarIntegridadeVideo, type SinalIntegridade } from '@/lib/video-forense';
import { tokenJaUsado } from '@/lib/token-uso-unico';
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
    const perdeuFocoRaw = formData.get('perdeuFoco');
    const framesRaw = formData.get('frames');

    if (typeof perguntaId !== 'string' || !(file instanceof File)) {
      return NextResponse.json({ error: 'perguntaId e video são obrigatórios' }, { status: 400 });
    }

    // V-SEC (anti-fraude, redesenhado 2026-08-14): as checagens abaixo NÃO rejeitam mais o
    // upload com mensagem explicativa. Uma resposta tipo "token de gravação ausente" ensina
    // o atacante exatamente qual é a barreira, e ele ajusta a tentativa seguinte até passar.
    // Agora o upload é aceito normalmente — o candidato não percebe nada — e o indício fica
    // registrado em `sinaisIntegridade` pro recrutador ver no perfil.
    const sinais: SinalIntegridade[] = [];
    let iniciadoEm: number | null = null;

    if (typeof tokenGravacao !== 'string' || !tokenGravacao) {
      sinais.push({
        codigo: 'sem_token',
        detalhe: 'O envio não trouxe a credencial que a tela de entrevista gera ao iniciar a gravação. Indica que o vídeo foi enviado direto para o sistema, sem passar pela tela.',
        peso: 'alto'
      });
    } else {
      const validacaoGravacao = await validarTokenGravacao(tokenGravacao, candidaturaId, perguntaId);
      if (!validacaoGravacao.ok) {
        sinais.push({
          codigo: 'token_invalido',
          detalhe: `A credencial de gravação não confere (${validacaoGravacao.erro}). O envio não corresponde a uma gravação iniciada normalmente nesta pergunta.`,
          peso: 'alto'
        });
      } else {
        iniciadoEm = validacaoGravacao.iniciadoEm;
        // Cada credencial vale para UM envio. Um segundo upload com a mesma credencial
        // significa que ela foi capturada e reaproveitada para outro arquivo.
        const reuso = await tokenJaUsado(tokenGravacao);
        if (reuso.usado) {
          sinais.push({
            codigo: 'token_reusado',
            detalhe: 'A mesma credencial de gravação já havia sido usada em outro envio. Cada gravação gera uma credencial própria — reaproveitar indica envio de arquivo fora do fluxo normal.',
            peso: 'alto'
          });
        } else if (!reuso.verificado) {
          // Sem isso, uma queda do Redis deixaria o perfil "limpo" sem que ninguém soubesse
          // que o controle de reuso simplesmente não rodou. Não vira sinal no perfil (seria
          // injusto acusar por falha nossa), mas fica registrado pra operação enxergar.
          reportarErro(new Error('Verificação de reuso de credencial indisponível (Redis fora do ar ou não configurado)'), {
            route: '/candidaturas/[id]/respostas',
            candidaturaId,
            extra: { perguntaId, fase: 'antifraude' }
          });
        }
      }
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

    // Análise forense do container: procura contradições factuais entre o arquivo e a janela
    // de tempo real da sessão (ver lib/video-forense.ts). Só roda com token válido — sem
    // `iniciadoEm` não há relógio confiável pra comparar, e o indício de token já foi
    // registrado acima de qualquer forma.
    if (iniciadoEm !== null) {
      sinais.push(...analisarIntegridadeVideo(buffer, isWebm, Date.now() - iniciadoEm));
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

    // V-SEC: sinal client-side, não confiável por si só (pode ser manipulado como qualquer
    // dado vindo do cliente) — daí o try/catch silencioso, não vale bloquear o upload por isso.
    let perdeuFoco: Resposta['perdeuFoco'];
    if (typeof perdeuFocoRaw === 'string') {
      try {
        const parsed = JSON.parse(perdeuFocoRaw);
        if (typeof parsed?.vezes === 'number' && typeof parsed?.segundosFora === 'number') {
          perdeuFoco = { vezes: Math.max(0, parsed.vezes), segundosFora: Math.max(0, parsed.segundosFora) };
        }
      } catch {
        // formato inesperado, segue sem o dado
      }
    }

    // V-SEC: frames vêm do canvas do navegador (ver app/entrevista/[vagaId]/page.tsx), não de
    // ffmpeg no servidor — o Vercel serverless não tem o binário, então a extração antiga
    // (lib/video.ts) sempre voltava [] em produção e a detecção de leitura nunca via imagem
    // nenhuma. Cap de 6 frames / ~800KB de base64 cada: generoso pro JPEG qualidade 0.5 do
    // client, mas impede abuso de payload (não é upload de arquivo, é campo de texto do form,
    // não entra no limite de 50MB do vídeo).
    let frames: { frameBase64: string; timestamp: string }[] = [];
    if (typeof framesRaw === 'string' && framesRaw.length < 6 * 1024 * 1024) {
      try {
        const parsed = JSON.parse(framesRaw);
        if (Array.isArray(parsed)) {
          frames = parsed
            .filter(
              (f): f is { frameBase64: string; timestamp: string } =>
                typeof f?.frameBase64 === 'string' &&
                typeof f?.timestamp === 'string' &&
                f.frameBase64.length < 800 * 1024
            )
            .slice(0, 6);
        }
      } catch {
        // formato inesperado, segue sem imagens (mesmo fallback de antes: estaLendo=false)
      }
    }

    // Regravação da MESMA pergunta: o upsert abaixo apaga a resposta anterior, então sem
    // contar aqui a informação se perde. Não bloqueamos a regravação (câmera falha, aba
    // recarrega — barrar puniria candidato honesto), mas um número alto mostra que a resposta
    // foi ensaiada até sair do jeito desejado, o que descaracteriza a espontaneidade.
    const anterior = candidatura.respostas?.find((r) => r.perguntaId === perguntaId);
    const tentativas = (anterior?.tentativas ?? (anterior ? 1 : 0)) + 1;
    if (tentativas >= 3) {
      sinais.push({
        codigo: 'regravacao_repetida',
        detalhe: `Esta pergunta foi gravada ${tentativas} vezes. Cada nova gravação substitui a anterior — o que está registrado é a última tentativa, não a resposta espontânea.`,
        peso: tentativas >= 5 ? 'alto' : 'medio'
      });
    }

    const respostaPlaceholder: Resposta = {
      perguntaId,
      videoPath,
      transcricao: '',
      score: 0,
      feedback: '',
      avaliando: true,
      ...(perdeuFoco ? { perdeuFoco } : {}),
      ...(sinais.length > 0 ? { sinaisIntegridade: sinais } : {}),
      tentativas
    };

    await upsertRespostaAtomica(candidaturaId, respostaPlaceholder);

    const curriculoTexto = [candidatura.linkedin, candidatura.curriculoPath].filter(Boolean).join('\n');
    processarRespostaIA(candidaturaId, perguntaId, tmpPath, videoPath, pergunta.texto, pergunta.criterios, vaga, frames, curriculoTexto || undefined)
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
  frames: { frameBase64: string; timestamp: string }[],
  curriculoTexto?: string
) {
  try {
    const transcricao = await transcribeAudio(tmpPath);

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
