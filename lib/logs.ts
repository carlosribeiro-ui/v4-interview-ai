import { randomUUID } from 'crypto';
import { getDb } from './mongodb';

export type LogEvento =
  | 'login'
  | 'login_falhou'
  | 'usuario_criado'
  | 'usuario_removido'
  | 'usuario_editado'
  | 'usuario_ativado'
  | 'usuario_desativado'
  | 'senha_resetada'
  | 'senha_alterada'
  | 'senha_reset_solicitado'
  | 'role_alterada'
  | 'fase_alterada'
  | 'candidatura_criada'
  | 'candidatura_removida'
  | 'vaga_criada'
  | 'vaga_removida'
  | 'rate_limit_hit'
  | 'rbac_denial'
  | 'auth_failure'
  | 'session_revoked'
  | 'erro_sistema'
  | 'webhook_config_alterado'
  | 'candidatura_finalizada'
  | 'parecer_gerado'
  | 'email_template_alterado';

export const EVENTOS_VALIDOS: LogEvento[] = [
  'login', 'login_falhou', 'usuario_criado', 'usuario_removido', 'usuario_editado',
  'usuario_ativado', 'usuario_desativado', 'senha_resetada', 'senha_alterada',
  'senha_reset_solicitado', 'role_alterada', 'fase_alterada', 'candidatura_criada',
  'candidatura_removida', 'vaga_criada', 'vaga_removida', 'rate_limit_hit', 'rbac_denial',
  'auth_failure', 'session_revoked', 'erro_sistema', 'webhook_config_alterado',
  'candidatura_finalizada', 'parecer_gerado', 'email_template_alterado'
];

export type LogEntry = {
  id: string;
  evento: LogEvento;
  ator?: string;
  detalhes?: Record<string, unknown>;
  criadoEm: string;
};

async function logsCollection() {
  const db = await getDb();
  return db.collection<LogEntry>('logs');
}

/** Grava um evento de auditoria. Nunca deve derrubar o fluxo principal — falha é engolida e só logada no console. */
export async function registrarLog(evento: LogEvento, detalhes?: Record<string, unknown>, ator?: string): Promise<void> {
  try {
    const col = await logsCollection();
    const entry: LogEntry = { id: randomUUID(), evento, ator, detalhes, criadoEm: new Date().toISOString() };
    await col.insertOne(entry);
    dispararWebhookConfiguravel(entry).catch(() => {});
    dispararEmailsConfiguraveis(entry).catch(() => {});
  } catch (err) {
    console.error('Falha ao registrar log:', evento, err);
  }
}

/**
 * Dispara todos os webhooks configurados via UI de admin (aba "Webhooks") que
 * escutam esse evento. Fire-and-forget — nunca aguarda nem derruba o fluxo de
 * quem chamou registrarLog. Import dinâmico pra evitar dependência circular
 * (lib/config.ts importa o tipo LogEvento daqui).
 */
async function dispararWebhookConfiguravel(entry: LogEntry): Promise<void> {
  const { webhooksParaEvento } = await import('./config');
  const webhooks = await webhooksParaEvento(entry.evento);
  if (webhooks.length === 0) return;

  await Promise.allSettled(
    webhooks.map((wh) =>
      fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `v4-interview-ai · ${entry.evento}${entry.ator ? ` · ${entry.ator}` : ''}`, ...entry })
      })
    )
  );
}

/**
 * Dispara e-mails configurados via UI de admin (aba "Modelos de e-mail" em /admin/config)
 * que escutam esse evento — fire-and-forget, nunca aguarda nem derruba quem chamou
 * registrarLog. Import dinâmico pelo mesmo motivo de dispararWebhookConfiguravel.
 */
async function dispararEmailsConfiguraveis(entry: LogEntry): Promise<void> {
  const { dispararEmailConfiguravel } = await import('./email-templates');
  await dispararEmailConfiguravel(entry.evento, entry.detalhes ?? {});
}

/** Registra evento de segurança com IP e User-Agent enriquecidos. */
export async function registrarLogSeguranca(
  evento: LogEvento,
  req: Request,
  detalhes?: Record<string, unknown>,
  ator?: string
): Promise<void> {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';
  const path = new URL(req.url).pathname;

  await registrarLog(evento, {
    ...detalhes,
    ip,
    userAgent,
    path,
    method: req.method
  }, ator);
}

export type FiltroLogs = {
  evento?: LogEvento;
  ator?: string;
  desde?: string; // ISO date
  ate?: string; // ISO date
  q?: string; // busca livre em ator + detalhes (stringificado)
  limite?: number;
};

export async function listarLogs(filtro: FiltroLogs = {}): Promise<LogEntry[]> {
  const col = await logsCollection();
  const query: Record<string, unknown> = {};

  if (filtro.evento) query.evento = filtro.evento;
  if (filtro.ator) query.ator = { $regex: escaparRegex(filtro.ator), $options: 'i' };
  if (filtro.desde || filtro.ate) {
    query.criadoEm = {
      ...(filtro.desde ? { $gte: filtro.desde } : {}),
      ...(filtro.ate ? { $lte: filtro.ate } : {})
    };
  }

  let cursor = col.find(query).sort({ criadoEm: -1 });
  const limite = Math.min(filtro.limite ?? 500, 2000);
  cursor = cursor.limit(limite);
  let resultados = await cursor.toArray();

  // Busca livre é feita em memória (detalhes é schemaless — não dá pra indexar bem no Mongo aqui)
  if (filtro.q) {
    const termo = filtro.q.toLowerCase();
    resultados = resultados.filter(
      (l) =>
        l.evento.toLowerCase().includes(termo) ||
        l.ator?.toLowerCase().includes(termo) ||
        JSON.stringify(l.detalhes ?? {}).toLowerCase().includes(termo)
    );
  }

  return resultados;
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Gera CSV dos logs pra export — mesma ordem/campos exibidos na UI. */
export function logsParaCsv(logs: LogEntry[]): string {
  const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ['Data/hora', 'Evento', 'Ator', 'Detalhes'];
  const linhas = logs.map((l) =>
    [
      new Date(l.criadoEm).toLocaleString('pt-BR'),
      l.evento,
      l.ator ?? '',
      l.detalhes ? JSON.stringify(l.detalhes) : ''
    ]
      .map((v) => escapar(String(v)))
      .join(',')
  );
  return '﻿' + [header.map(escapar).join(','), ...linhas].join('\n');
}

/**
 * Rede de segurança de erro em produção sem depender de conta externa (Sentry etc).
 * Grava o erro na própria coleção `logs` (visível em /logs e na aba Configurações)
 * e, se ALERT_WEBHOOK_URL estiver setada (ex: webhook do Slack ou de um workflow n8n),
 * dispara um POST fire-and-forget — nunca aguarda nem derruba o fluxo por causa disso.
 * Chamada pelo instrumentation.ts (onRequestError), que o Next.js invoca automaticamente
 * em qualquer erro não tratado de uma rota/página no runtime Node.
 */
export async function registrarErroSistema(mensagem: string, detalhes?: Record<string, unknown>): Promise<void> {
  await registrarLog('erro_sistema', { mensagem: mensagem.slice(0, 500), ...detalhes });

  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (!webhook) return;
  try {
    fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `🔴 v4-interview-ai erro em produção: ${mensagem.slice(0, 300)}`, ...detalhes })
    }).catch(() => {});
  } catch {
    // webhook é best-effort — nunca deve quebrar o tratamento de erro
  }
}
