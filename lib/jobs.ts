/**
 * Async Job Queue — processamento assíncrono com retry, DLQ, e idempotency.
 *
 * Padrão: Pub/Sub simplificado. Jobs são persistidos em MongoDB (collection
 * 'jobs') com status machine: pending → running → completed/failed → dead.
 *
 * Para Vercel serverless: jobs são disparados como fire-and-forget promises.
 * O worker roda na mesma instância (background processing). Para escala real,
 * migrar pra BullMQ + Redis ou Inngest.
 *
 * Features:
 * - Retry com exponential backoff (3 tentativas default)
 * - Dead Letter Queue (jobs que falharam 3x ficam em 'dead')
 * - Idempotency key pra não processar o mesmo job duas vezes
 * - Logging estruturado de cada transição de estado
 */

import { randomUUID } from 'crypto';
import { getDb } from './mongodb';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dead';

export type Job<TInput = any> = {
  id: string;
  tipo: string;
  input: TInput;
  status: JobStatus;
  tentativas: number;
  maxTentativas: number;
  erro?: string;
  resultado?: any;
  /** Chave de idempotency — jobs com a mesma key não são reprocessados */
  idempotencyKey?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  nextRetryAt?: string;
};

const DEFAULT_MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000; // 1s, 2s, 4s (exponential)

async function jobsCollection() {
  const db = await getDb();
  return db.collection<Job>('jobs');
}

/**
 * Enfileira um job.
 * Se já existe um job com a mesma idempotencyKey e status pending/running,
 * retorna o job existente (não duplica).
 */
export async function enqueueJob<TInput>(
  tipo: string,
  input: TInput,
  opts?: { idempotencyKey?: string; maxTentativas?: number }
): Promise<Job<TInput>> {
  const col = await jobsCollection();

  // Idempotency check
  if (opts?.idempotencyKey) {
    const existente = await col.findOne({
      idempotencyKey: opts.idempotencyKey,
      status: { $in: ['pending', 'running'] }
    });
    if (existente) return existente as Job<TInput>;
  }

  const job: Job<TInput> = {
    id: randomUUID(),
    tipo,
    input,
    status: 'pending',
    tentativas: 0,
    maxTentativas: opts?.maxTentativas ?? DEFAULT_MAX_RETRIES,
    idempotencyKey: opts?.idempotencyKey,
    createdAt: new Date().toISOString()
  };

  await col.insertOne(job as any);
  console.log(JSON.stringify({ _type: 'job', evento: 'enqueued', jobId: job.id, tipo }));
  return job;
}

/**
 * Processa o próximo job pendente.
 * Retorna null se não há jobs pendentes.
 */
export async function processarProximoJob(
  handlers: Record<string, (input: any) => Promise<any>>
): Promise<Job | null> {
  const col = await jobsCollection();

  // Busca próximo job pending (FIFO por createdAt)
  const job = await col.findOneAndUpdate(
    { status: 'pending' } as any,
    {
      $set: { status: 'running', startedAt: new Date().toISOString() } as any,
      $inc: { tentativas: 1 }
    } as any,
    { returnDocument: 'after', sort: { createdAt: 1 } }
  );

  if (!job) return null;

  const handler = handlers[job.tipo];
  if (!handler) {
    await col.updateOne(
      { id: job.id } as any,
      { $set: { status: 'dead', erro: `Handler não encontrado: ${job.tipo}`, completedAt: new Date().toISOString() } } as any
    );
    return null;
  }

  try {
    const resultado = await handler(job.input);
    await col.updateOne(
      { id: job.id } as any,
      { $set: { status: 'completed', resultado, completedAt: new Date().toISOString() } } as any
    );
    console.log(JSON.stringify({ _type: 'job', evento: 'completed', jobId: job.id, tipo: job.tipo }));
    return null; // Processou 1 job
  } catch (err: any) {
    const proximoRetry = job.tentativas < job.maxTentativas;

    if (proximoRetry) {
      // Retry com exponential backoff
      const delay = BASE_RETRY_DELAY_MS * Math.pow(2, job.tentativas - 1);
      const nextRetryAt = new Date(Date.now() + delay).toISOString();

      await col.updateOne(
        { id: job.id } as any,
        {
          $set: {
            status: 'pending', // Volta pra pending pra ser reprocessado
            erro: err.message ?? String(err),
            nextRetryAt
          }
        } as any
      );
      console.log(JSON.stringify({
        _type: 'job', evento: 'retry_scheduled',
        jobId: job.id, tentativa: job.tentativas, nextRetryAt
      }));
    } else {
      // Move pra Dead Letter Queue
      await col.updateOne(
        { id: job.id } as any,
        {
          $set: {
            status: 'dead',
            erro: err.message ?? String(err),
            completedAt: new Date().toISOString()
          }
        } as any
      );
      console.error(JSON.stringify({
        _type: 'job', evento: 'dead',
        jobId: job.id, tipo: job.tipo, erro: err.message
      }));
    }

    return null;
  }
}

/**
 * Processa todos os jobs pendentes (batch).
 * Útil pra cron ou warm start.
 */
export async function processarTodosJobs(
  handlers: Record<string, (input: any) => Promise<any>>,
  maxJobs = 10
): Promise<{ processados: number; erros: number }> {
  let processados = 0;
  let erros = 0;

  for (let i = 0; i < maxJobs; i++) {
    const resultado = await processarProximoJob(handlers);
    if (!resultado) break;
    processados++;
  }

  return { processados, erros };
}

/**
 * Retorna estatísticas da fila (pra monitoring).
 */
export async function estatisticasFila(): Promise<Record<JobStatus, number>> {
  const col = await jobsCollection();
  const stats: Record<string, number> = { pending: 0, running: 0, completed: 0, failed: 0, dead: 0 };

  for (const status of Object.keys(stats)) {
    stats[status] = await col.countDocuments({ status } as any);
  }

  return stats as Record<JobStatus, number>;
}
