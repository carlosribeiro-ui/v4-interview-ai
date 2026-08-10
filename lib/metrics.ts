/**
 * Observabilidade: métricas de latência, throughput, e errors.
 *
 * Coleta em memória com flush periódico pro console (structured logging).
 * Para produção com Sentry/DataDog, substituir por exports específicos.
 *
 * Padrão: cada operação crítica é wrapada com `medir()` que registra
 * latência, status (success/error), e detalhes.
 */

type MetricEntry = {
  operacao: string;
  duracaoMs: number;
  sucesso: boolean;
  erro?: string;
  detalhes?: Record<string, unknown>;
  timestamp: string;
};

// Buffer em memória — flush a cada 30s ou 100 entries
const buffer: MetricEntry[] = [];
const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_SIZE = 100;
let lastFlush = Date.now();

function flush() {
  if (buffer.length === 0) return;
  if (buffer.length < FLUSH_SIZE && Date.now() - lastFlush < FLUSH_INTERVAL_MS) return;

  const entries = buffer.splice(0);
  lastFlush = Date.now();

  // Agrupa por operação pra log compacto
  const grouped = new Map<string, { count: number; totalMs: number; errors: number }>();
  for (const e of entries) {
    const g = grouped.get(e.operacao) ?? { count: 0, totalMs: 0, errors: 0 };
    g.count++;
    g.totalMs += e.duracaoMs;
    if (!e.sucesso) g.errors++;
    grouped.set(e.operacao, g);
  }

  for (const [op, g] of grouped) {
    const avgMs = Math.round(g.totalMs / g.count);
    console.log(JSON.stringify({
      _type: 'metrics',
      operacao: op,
      count: g.count,
      avgMs,
      errors: g.errors,
      errorRate: g.count > 0 ? Math.round((g.errors / g.count) * 100) : 0
    }));
  }

  // Log erros individuais (pra debugging)
  for (const e of entries.filter((x) => !x.sucesso)) {
    console.error(JSON.stringify({
      _type: 'error',
      operacao: e.operacao,
      duracaoMs: e.duracaoMs,
      erro: e.erro,
      detalhes: e.detalhes,
      timestamp: e.timestamp
    }));
  }
}

// Flush periódico
if (typeof setInterval !== 'undefined') {
  setInterval(flush, FLUSH_INTERVAL_MS);
}

/**
 * Mede a latência de uma operação e registra métricas.
 *
 * @example
 * const resultado = await medir('gemini.evaluation', async () => {
 *   return avaliarResposta(...);
 * }, { candidaturaId, perguntaId });
 */
export async function medir<T>(
  operacao: string,
  fn: () => Promise<T>,
  detalhes?: Record<string, unknown>
): Promise<T> {
  const start = performance.now();
  let sucesso = true;
  let erro: string | undefined;

  try {
    const resultado = await fn();
    return resultado;
  } catch (err: any) {
    sucesso = false;
    erro = err.message ?? String(err);
    throw err;
  } finally {
    const duracaoMs = Math.round(performance.now() - start);
    buffer.push({
      operacao,
      duracaoMs,
      sucesso,
      erro,
      detalhes,
      timestamp: new Date().toISOString()
    });
    flush();
  }
}

/**
 * Registra um counter (sem timing).
 */
export function contar(operacao: string, detalhes?: Record<string, unknown>): void {
  buffer.push({
    operacao,
    duracaoMs: 0,
    sucesso: true,
    detalhes,
    timestamp: new Date().toISOString()
  });
  flush();
}

/**
 * Registra um erro estruturado.
 */
export function registrarErro(
  operacao: string,
  erro: string,
  detalhes?: Record<string, unknown>
): void {
  buffer.push({
    operacao,
    duracaoMs: 0,
    sucesso: false,
    erro,
    detalhes,
    timestamp: new Date().toISOString()
  });
  flush();
}

/** Força flush manual (pra shutdown). */
export function flushMetrics(): void {
  flush();
}
