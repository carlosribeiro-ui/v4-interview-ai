/**
 * Per-resource mutex queue — serializa operações no mesmo recurso.
 *
 * Problema: mesmo com optimistic locking (version field), duas requests
 * simultâneas para a mesma candidatura causam retry desnecessário — uma
 * lê, a outra lê, uma escreve, a outra falha e precisa reler.
 *
 * Solução:此 mutex garante que só UMA operação por resource ID roda por vez.
 * Requests concorrentes para o mesmo ID ficam em fila (encadeiam promises).
 * Requests para IDs diferentes rodam em paralelo.
 *
 * Compatível com serverless (Vercel): o state é por-instância, mas entre
 * requests da mesma instância elimina 100% dos race conditions. Entre
 * instâncias, o optimistic locking no DB é o fallback seguro.
 *
 * TTL de 30s previne memory leak se uma promise travar.
 */

type QueueEntry = {
  promise: Promise<any>;
  timestamp: number;
};

const LOCK_TIMEOUT_MS = 30_000;
const store = new Map<string, QueueEntry>();

// Cleanup periódico de entradas stale
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now - entry.timestamp > LOCK_TIMEOUT_MS) {
      store.delete(key);
    }
  }
}

/**
 * Executa uma operação serializada por chave.
 * Se já existe uma operação pendente para esta chave, espera ela terminar
 * antes de executar a próxima. Operações para chaves diferentes rodam em paralelo.
 *
 * @param key    Chave única do recurso (ex: candidatura ID, vaga ID)
 * @param fn     Operação assíncrona a ser executada
 * @returns     O resultado de fn
 *
 * @example
 * // Duas requests simultâneas para candidatura "abc-123":
 * const resultado1 = comFila('candidatura:abc-123', () => atualizar(...));
 * const resultado2 = comFila('candidatura:abc-123', () => mudarFase(...));
 * // resultado2 espera resultado1 terminar antes de executar.
 *
 * // Requests para candidaturas diferentes rodam em paralelo:
 * const r1 = comFila('candidatura:abc', () => atualizar(...));
 * const r2 = comFila('candidatura:def', () => mudarFase(...));
 * // r1 e r2 rodam simultaneamente.
 */
export async function comFila<T>(key: string, fn: () => Promise<T>): Promise<T> {
  cleanup();

  // Espera a operação anterior para esta chave (se existir)
  const anterior = store.get(key);
  const esperar = anterior?.promise ?? Promise.resolve();

  // Cria a nova promise encadeada.
  // Usa .then(fn, ignore) pra que erros da operação anterior não impeçam
  // a execução da atual, e pra que a rejeição não seja "unhandled".
  const minhaPromise = esperar.then(
    () => fn(),
    () => fn() // Se a anterior falhou, ainda assim executa esta
  ).finally(() => {
    const atual = store.get(key);
    if (atual && atual.timestamp === timestamp) {
      store.delete(key);
    }
  });

  const timestamp = Date.now();
  store.set(key, { promise: minhaPromise, timestamp });

  return minhaPromise;
}

/**
 * Verifica se há operações pendentes para uma chave.
 * Útil pra logging/monitoring.
 */
export function temOperacaoPendente(key: string): boolean {
  return store.has(key);
}

/**
 * Retorna o número de operações pendentes no total.
 * Útil pra health check / monitoring.
 */
export function totalOperacoesPendentes(): number {
  return store.size;
}
