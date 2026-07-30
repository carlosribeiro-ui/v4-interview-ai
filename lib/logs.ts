import { randomUUID } from 'crypto';
import { getDb } from './mongodb';

export type LogEvento =
  | 'login'
  | 'login_falhou'
  | 'usuario_criado'
  | 'usuario_removido'
  | 'fase_alterada'
  | 'candidatura_criada'
  | 'candidatura_removida'
  | 'vaga_criada'
  | 'vaga_removida';

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
    await col.insertOne({ id: randomUUID(), evento, ator, detalhes, criadoEm: new Date().toISOString() });
  } catch (err) {
    console.error('Falha ao registrar log:', evento, err);
  }
}

export async function listarLogs(limite = 200): Promise<LogEntry[]> {
  const col = await logsCollection();
  return col.find({}).sort({ criadoEm: -1 }).limit(limite).toArray();
}
