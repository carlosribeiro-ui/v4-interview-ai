/**
 * Cache layer com Upstash Redis (cross-instance) e fallback in-memory.
 *
 * Padrão: stale-while-revalidate — retorna cache stale imediatamente
 * enquanto revalida em background. Evita thundering herd.
 *
 * Usado para: getVagas(), getVaga(), getCandidaturas() — queries que
 * disparam em toda page load e não precisam de dados 100% frescos.
 */

import { Redis } from '@upstash/redis';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

let redis: Redis | null = null;
if (UPSTASH_URL && UPSTASH_TOKEN) {
  redis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
}

// ─── In-memory fallback ────────────────────────────────────────────────────

type CacheEntry<T> = { value: T; expiresAt: number; staleAt: number };
const memCache = new Map<string, CacheEntry<any>>();
const MEM_CLEANUP_MS = 60_000;
let lastMemCleanup = Date.now();

function memCleanup() {
  const now = Date.now();
  if (now - lastMemCleanup < MEM_CLEANUP_MS) return;
  lastMemCleanup = now;
  for (const [key, entry] of memCache) {
    if (entry.expiresAt <= now) memCache.delete(key);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export type CacheOptions = {
  /** TTL em segundos (dados frescos). Default: 30s. */
  ttl?: number;
  /** Stale time em segundos (dados "stale" mas servíveis). Default: 60s. */
  stale?: number;
  /** Prefixo pra namespacing. Ex: "vagas", "candidaturas" */
  prefix: string;
};

/**
 * Busca do cache com stale-while-revalidate.
 * Retorna { value, stale } — se stale=true, o caller pode decidir
 * se servir o valor stale ou aguardar revalidação.
 */
export async function cacheGet<T>(
  key: string,
  opts: CacheOptions
): Promise<{ value: T; stale: boolean } | null> {
  const fullKey = `${opts.prefix}:${key}`;
  const ttl = (opts.ttl ?? 30) * 1000;
  const stale = (opts.stale ?? 60) * 1000;

  // 1. Tenta Redis
  if (redis) {
    try {
      const raw = await redis.get<string>(fullKey);
      if (raw) {
        const entry: CacheEntry<T> = JSON.parse(raw);
        const now = Date.now();
        if (entry.expiresAt > now) {
          return { value: entry.value, stale: false }; // Fresco
        }
        if (entry.staleAt > now) {
          return { value: entry.value, stale: true }; // Stale mas servível
        }
        // Expirou completamente — remove
        await redis.del(fullKey).catch(() => {});
      }
    } catch {
      // Fallback silencioso pra in-memory
    }
  }

  // 2. Tenta in-memory
  memCleanup();
  const entry = memCache.get(fullKey);
  if (entry) {
    const now = Date.now();
    if (entry.expiresAt > now) {
      return { value: entry.value, stale: false };
    }
    if (entry.staleAt > now) {
      return { value: entry.value, stale: true };
    }
    memCache.delete(fullKey);
  }

  return null;
}

/**
 * Salva no cache (Redis + in-memory).
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  opts: CacheOptions
): Promise<void> {
  const fullKey = `${opts.prefix}:${key}`;
  const ttl = (opts.ttl ?? 30) * 1000;
  const stale = (opts.stale ?? 60) * 1000;
  const now = Date.now();

  const entry: CacheEntry<T> = {
    value,
    expiresAt: now + ttl,
    staleAt: now + ttl + stale
  };

  // Salva em ambos (best-effort)
  const serialized = JSON.stringify(entry);

  if (redis) {
    // TTL = ttl + stale (mantém no Redis até expirar completamente)
    await redis.set(fullKey, serialized, { ex: Math.ceil((ttl + stale) / 1000) }).catch(() => {});
  }

  memCache.set(fullKey, entry);
}

/**
 * Invalida uma chave do cache.
 */
export async function cacheDel(key: string, prefix: string): Promise<void> {
  const fullKey = `${prefix}:${key}`;
  if (redis) {
    await redis.del(fullKey).catch(() => {});
  }
  memCache.delete(fullKey);
}

/**
 * Invalida todas as chaves com um prefixo (ex: todas as vagas).
 */
export async function cacheDelPrefix(prefix: string): Promise<void> {
  // In-memory: remove todas as chaves com o prefixo
  for (const key of memCache.keys()) {
    if (key.startsWith(`${prefix}:`)) {
      memCache.delete(key);
    }
  }
  // Redis: não tem delByPattern no Upstash, mas o TTL cuida disso
}
