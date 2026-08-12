import { NextRequest, NextResponse } from 'next/server';
import { lerSessao } from '@/lib/auth';
import { listarWebhooks, criarWebhook } from '@/lib/config';
import { registrarLog, EVENTOS_VALIDOS, type LogEvento } from '@/lib/logs';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode ver os webhooks' }, { status: 403 });
  }
  return NextResponse.json(await listarWebhooks());
}

export async function POST(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode criar webhooks' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { nome, url, eventos } = body ?? {};

  if (typeof nome !== 'string' || !nome.trim()) {
    return NextResponse.json({ error: 'nome é obrigatório' }, { status: 400 });
  }
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'url deve começar com http:// ou https://' }, { status: 400 });
  }
  if (!Array.isArray(eventos) || eventos.length === 0 || eventos.some((e) => typeof e !== 'string' || !EVENTOS_VALIDOS.includes(e as LogEvento))) {
    return NextResponse.json({ error: 'eventos deve ser uma lista não-vazia de eventos válidos' }, { status: 400 });
  }

  const webhook = await criarWebhook({ nome, url, eventos: eventos as LogEvento[] });
  await registrarLog('webhook_config_alterado', { acao: 'criado', nome: webhook.nome, eventos }, sessao.email);
  return NextResponse.json(webhook, { status: 201 });
}
