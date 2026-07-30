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
import type { Resposta } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
  // Escreve em /tmp (único dir gravável em serverless) só para o ffmpeg/transcrição
  // lerem o arquivo local — o armazenamento definitivo é o bucket R2.
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

  // Transcrição/avaliação rodam antes de responder (não em background): em ambiente
  // serverless (Vercel) a função é congelada assim que a resposta é enviada, então um
  // "fire-and-forget" depois do NextResponse nunca terminaria de rodar.
  try {
    const [transcricao, frames] = await Promise.all([
      transcribeAudio(tmpPath),
      Promise.resolve(extractarFrames(tmpPath))
    ]);

    const avaliacao = await avaliarResposta(
      pergunta.texto,
      pergunta.criterios,
      transcricao,
      vaga.senioridade,
      vaga.requisitos,
      frames
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

    return NextResponse.json(resposta, { status: 201 });
  } catch (err) {
    console.error(`[respostas] erro ao avaliar (candidatura=${candidaturaId} pergunta=${perguntaId}):`, err);

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

    return NextResponse.json(respostaComErro, { status: 201 });
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
