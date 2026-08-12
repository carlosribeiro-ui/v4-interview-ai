import { getDb } from './mongodb';
import type { LogEvento } from './logs';

/**
 * Configurações da aplicação que precisam ser editáveis em runtime (via UI de admin),
 * sem redeploy — diferente de env vars. Por enquanto só o webhook de logs, mas o
 * desenho (doc único por "id" na collection `configuracoes`) comporta mais chaves.
 */
export type WebhookLogsConfig = {
  id: 'webhook_logs';
  url: string;
  eventos: LogEvento[];
  atualizadoEm: string;
};

async function configuracoesCollection() {
  const db = await getDb();
  return db.collection<WebhookLogsConfig>('configuracoes');
}

export async function getWebhookLogsConfig(): Promise<WebhookLogsConfig | null> {
  const col = await configuracoesCollection();
  return col.findOne({ id: 'webhook_logs' });
}

export async function salvarWebhookLogsConfig(url: string, eventos: LogEvento[]): Promise<void> {
  const col = await configuracoesCollection();
  await col.updateOne(
    { id: 'webhook_logs' },
    { $set: { id: 'webhook_logs', url, eventos, atualizadoEm: new Date().toISOString() } },
    { upsert: true }
  );
}

export async function removerWebhookLogsConfig(): Promise<void> {
  const col = await configuracoesCollection();
  await col.deleteOne({ id: 'webhook_logs' });
}
