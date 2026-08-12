import { NextRequest, NextResponse } from 'next/server';
import { lerSessao, extrairCandidaturaId, criarTokenGravacao } from '@/lib/auth';
import { getCandidatura, getVaga } from '@/lib/store';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * Marca o início real da gravação de uma pergunta (chamado pelo front no instante em que
 * MediaRecorder.start() roda, não antes) e devolve um token curto que o upload da resposta
 * (POST .../respostas) vai exigir. Ver lib/auth-edge.ts (criarTokenGravacao) pro racional
 * anti-fraude — impede enviar um vídeo qualquer direto pra API sem passar pelo fluxo real.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await lerSessao(req);
  const candidatoId = await extrairCandidaturaId(req);
  if ((!sessao || (sessao.role !== 'admin' && sessao.role !== 'talent')) && candidatoId !== params.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const bloqueado = await aplicarRateLimit(req, 'video-upload', LIMITES.videoUpload);
  if (bloqueado) return bloqueado;

  const body = await req.json().catch(() => ({}));
  const { perguntaId } = body ?? {};
  if (typeof perguntaId !== 'string' || !perguntaId) {
    return NextResponse.json({ error: 'perguntaId é obrigatório' }, { status: 400 });
  }

  const candidatura = await getCandidatura(params.id);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

  const vaga = await getVaga(candidatura.vagaId);
  if (!vaga?.perguntas.some((p) => p.id === perguntaId)) {
    return NextResponse.json({ error: 'Pergunta não encontrada nesta vaga' }, { status: 404 });
  }

  const token = await criarTokenGravacao(params.id, perguntaId);
  return NextResponse.json({ token });
}
