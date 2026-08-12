import { NextRequest, NextResponse } from 'next/server';
import { lerSessao } from '@/lib/auth';
import { buscarWebhook, atualizarWebhook, removerWebhook } from '@/lib/config';
import { registrarLog, EVENTOS_VALIDOS, type LogEvento } from '@/lib/logs';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode editar webhooks' }, { status: 403 });
  }

  const alvo = await buscarWebhook(params.id);
  if (!alvo) return NextResponse.json({ error: 'Webhook não encontrado' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { nome, url, eventos, ativo } = body ?? {};

  if (nome !== undefined && (typeof nome !== 'string' || !nome.trim())) {
    return NextResponse.json({ error: 'nome deve ser texto não-vazio' }, { status: 400 });
  }
  if (url !== undefined && (typeof url !== 'string' || !/^https?:\/\//i.test(url))) {
    return NextResponse.json({ error: 'url deve começar com http:// ou https://' }, { status: 400 });
  }
  if (eventos !== undefined && (!Array.isArray(eventos) || eventos.some((e) => typeof e !== 'string' || !EVENTOS_VALIDOS.includes(e as LogEvento)))) {
    return NextResponse.json({ error: 'eventos deve ser uma lista de eventos válidos' }, { status: 400 });
  }
  if (ativo !== undefined && typeof ativo !== 'boolean') {
    return NextResponse.json({ error: 'ativo deve ser booleano' }, { status: 400 });
  }

  await atualizarWebhook(params.id, { nome, url, eventos, ativo });
  await registrarLog('webhook_config_alterado', { acao: 'editado', nome: nome ?? alvo.nome }, sessao.email);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode remover webhooks' }, { status: 403 });
  }

  const alvo = await buscarWebhook(params.id);
  if (!alvo) return NextResponse.json({ error: 'Webhook não encontrado' }, { status: 404 });

  await removerWebhook(params.id);
  await registrarLog('webhook_config_alterado', { acao: 'removido', nome: alvo.nome }, sessao.email);
  return NextResponse.json({ ok: true });
}
