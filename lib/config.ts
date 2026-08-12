import { randomUUID } from 'crypto';
import { getDb } from './mongodb';
import type { LogEvento } from './logs';

/**
 * Webhooks configurados via UI de admin (aba "Webhooks" em /admin/config), sem
 * precisar de redeploy — diferente de ALERT_WEBHOOK_URL (env var, só erro_sistema).
 * Suporta múltiplos destinos (ex: um pro Slack de segurança, outro pro n8n de logs gerais),
 * cada um com seu próprio subconjunto de eventos.
 */
export type WebhookConfig = {
  id: string;
  nome: string;
  url: string;
  eventos: LogEvento[];
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
};

async function webhooksCollection() {
  const db = await getDb();
  return db.collection<WebhookConfig>('webhooks');
}

/** Formato antigo (single-webhook), usado antes da aba dedicada. Migrado sob demanda. */
type WebhookLogsConfigAntigo = { id: 'webhook_logs'; url: string; eventos: LogEvento[]; atualizadoEm: string };

/**
 * Migração lazy, uma vez só: se existir o doc antigo (`configuracoes/webhook_logs`)
 * e a collection nova ainda estiver vazia, converte pra um WebhookConfig e apaga o antigo.
 * Idempotente — se já migrou (ou nunca existiu), não faz nada.
 */
async function migrarWebhookAntigoSeNecessario(): Promise<void> {
  const db = await getDb();
  const colAntiga = db.collection<WebhookLogsConfigAntigo>('configuracoes');
  const antigo = await colAntiga.findOne({ id: 'webhook_logs' });
  if (!antigo) return;

  const col = await webhooksCollection();
  const jaExiste = await col.countDocuments();
  if (jaExiste === 0) {
    const agora = new Date().toISOString();
    await col.insertOne({
      id: randomUUID(),
      nome: 'Webhook migrado',
      url: antigo.url,
      eventos: antigo.eventos,
      ativo: true,
      criadoEm: antigo.atualizadoEm ?? agora,
      atualizadoEm: agora
    });
  }
  await colAntiga.deleteOne({ id: 'webhook_logs' });
}

export async function listarWebhooks(): Promise<WebhookConfig[]> {
  await migrarWebhookAntigoSeNecessario();
  const col = await webhooksCollection();
  return col.find({}).sort({ criadoEm: 1 }).toArray();
}

/** Só os ativos que escutam um evento específico — usado no dispatch de registrarLog. */
export async function webhooksParaEvento(evento: LogEvento): Promise<WebhookConfig[]> {
  await migrarWebhookAntigoSeNecessario();
  const col = await webhooksCollection();
  return col.find({ ativo: true, eventos: evento }).toArray();
}

export async function criarWebhook(dados: { nome: string; url: string; eventos: LogEvento[] }): Promise<WebhookConfig> {
  const col = await webhooksCollection();
  const agora = new Date().toISOString();
  const webhook: WebhookConfig = {
    id: randomUUID(),
    nome: dados.nome.trim(),
    url: dados.url.trim(),
    eventos: dados.eventos,
    ativo: true,
    criadoEm: agora,
    atualizadoEm: agora
  };
  await col.insertOne(webhook);
  return webhook;
}

export async function atualizarWebhook(
  id: string,
  dados: Partial<{ nome: string; url: string; eventos: LogEvento[]; ativo: boolean }>
): Promise<void> {
  const col = await webhooksCollection();
  const set: Record<string, unknown> = { atualizadoEm: new Date().toISOString() };
  if (dados.nome !== undefined) set.nome = dados.nome.trim();
  if (dados.url !== undefined) set.url = dados.url.trim();
  if (dados.eventos !== undefined) set.eventos = dados.eventos;
  if (dados.ativo !== undefined) set.ativo = dados.ativo;
  await col.updateOne({ id }, { $set: set });
}

export async function removerWebhook(id: string): Promise<void> {
  const col = await webhooksCollection();
  await col.deleteOne({ id });
}

export async function buscarWebhook(id: string): Promise<WebhookConfig | null> {
  const col = await webhooksCollection();
  return col.findOne({ id });
}
