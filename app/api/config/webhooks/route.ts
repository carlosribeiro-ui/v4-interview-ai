import { NextRequest, NextResponse } from 'next/server';
import { lerSessao } from '@/lib/auth';
import { getWebhookLogsConfig, salvarWebhookLogsConfig, removerWebhookLogsConfig } from '@/lib/config';
import { registrarLog, type LogEvento } from '@/lib/logs';

export const dynamic = 'force-dynamic';

const EVENTOS_VALIDOS: LogEvento[] = [
  'login', 'login_falhou', 'usuario_criado', 'usuario_removido', 'usuario_editado',
  'usuario_ativado', 'usuario_desativado', 'senha_resetada', 'senha_alterada',
  'role_alterada', 'fase_alterada', 'candidatura_criada', 'candidatura_removida',
  'vaga_criada', 'vaga_removida', 'rate_limit_hit', 'rbac_denial', 'auth_failure',
  'session_revoked', 'erro_sistema', 'webhook_config_alterado'
];

export async function GET(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode ver a config de webhooks' }, { status: 403 });
  }
  const config = await getWebhookLogsConfig();
  return NextResponse.json(config ?? { url: '', eventos: [] });
}

export async function PUT(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode configurar webhooks' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { url, eventos } = body ?? {};

  if (url !== undefined && typeof url !== 'string') {
    return NextResponse.json({ error: 'url deve ser texto' }, { status: 400 });
  }
  if (url && !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'url deve começar com http:// ou https://' }, { status: 400 });
  }
  if (!Array.isArray(eventos) || eventos.some((e) => typeof e !== 'string' || !EVENTOS_VALIDOS.includes(e as LogEvento))) {
    return NextResponse.json({ error: 'eventos deve ser uma lista de eventos válidos' }, { status: 400 });
  }

  if (!url) {
    await removerWebhookLogsConfig();
  } else {
    await salvarWebhookLogsConfig(url, eventos as LogEvento[]);
  }

  await registrarLog('webhook_config_alterado', { url: url || '(removido)', eventos }, sessao.email);
  return NextResponse.json({ ok: true });
}
