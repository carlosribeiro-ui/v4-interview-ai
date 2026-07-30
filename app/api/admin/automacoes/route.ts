import { NextRequest, NextResponse } from 'next/server';
import { lerSessao } from '@/lib/auth';
import { getVagas, getVaga, saveVaga } from '@/lib/store';
import { registrarLog } from '@/lib/logs';

export const dynamic = 'force-dynamic';

export type AutomacaoItem = {
  vagaId: string;
  vagaCargo: string;
  faseId: string;
  faseNome: string;
  webhookUrl?: string;
};

/** Visão centralizada de todos os webhooks de fase, de todas as vagas — pra configurar automações num só lugar. */
export async function GET(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode gerenciar automações' }, { status: 403 });
  }

  const vagas = await getVagas();
  const itens: AutomacaoItem[] = vagas.flatMap((v) =>
    v.fases.map((f) => ({
      vagaId: v.id,
      vagaCargo: v.cargo,
      faseId: f.id,
      faseNome: f.nome,
      ...(f.webhookUrl ? { webhookUrl: f.webhookUrl } : {})
    }))
  );
  return NextResponse.json(itens);
}

/** Atualiza (ou remove, com webhookUrl vazio) o webhook de uma única fase de uma vaga. */
export async function PATCH(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode gerenciar automações' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { vagaId, faseId, webhookUrl } = body ?? {};
  if (typeof vagaId !== 'string' || typeof faseId !== 'string') {
    return NextResponse.json({ error: 'vagaId e faseId são obrigatórios' }, { status: 400 });
  }

  const vaga = await getVaga(vagaId);
  if (!vaga) return NextResponse.json({ error: 'Vaga não encontrada' }, { status: 404 });

  const fase = vaga.fases.find((f) => f.id === faseId);
  if (!fase) return NextResponse.json({ error: 'Fase não encontrada' }, { status: 404 });

  if (typeof webhookUrl === 'string' && webhookUrl.trim()) {
    fase.webhookUrl = webhookUrl.trim();
  } else {
    delete fase.webhookUrl;
  }

  await saveVaga(vaga);
  await registrarLog('webhook_configurado', { vagaId, faseId, webhookUrl: fase.webhookUrl ?? null }, sessao.email);
  return NextResponse.json({ ok: true, webhookUrl: fase.webhookUrl });
}
