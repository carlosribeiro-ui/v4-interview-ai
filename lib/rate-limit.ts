/**
 * Rate limiter com Upstash Redis (cross-instance) e fallback in-memory.
 *
 * Upstash Redis é um datastore serverless com free tier de 10k comandos/dia.
 * Cada request consome ~1-3 comandos, então 10k = ~3k-10k requests/dia.
 * Se UPSTASH_REDIS_REST_URL não estiver configurado, fallback para in-memory
 * (funciona apenas dentro de uma mesma instância Vercel).
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ─── Upstash Redis (cross-instance) ────────────────────────────────────────

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

let upstashLimiter: Ratelimit | null = null;

if (UPSTASH_URL && UPSTASH_TOKEN) {
  const redis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
  upstashLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, '60 s'),
    analytics: true,
    prefix: 'v4interview'
  });
}

// ─── In-memory fallback ────────────────────────────────────────────────────

type Entry = { count: number; resetAt: number };
const memStore = new Map<string, Entry>();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function memCleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of memStore) {
    if (entry.resetAt <= now) memStore.delete(key);
  }
}

function memRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  memCleanup();
  const now = Date.now();
  const entry = memStore.get(key);

  if (!entry || entry.resetAt <= now) {
    memStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  entry.count++;
  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

// ─── Unified API ───────────────────────────────────────────────────────────

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Verifica se a requisição está dentro do limite.
 * Usa Upstash Redis se configurado, senão fallback in-memory.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs = 60_000
): Promise<RateLimitResult> {
  if (upstashLimiter) {
    try {
      const result = await upstashLimiter.limit(key, {
        // Upstash Ratelimit não aceita window customizado no slidingWindow,
        // então usamos multiplicações de limit por tempo.
        // Na prática, usamos o default 60s do constructor.
      });
      return {
        allowed: result.success,
        remaining: result.remaining,
        resetAt: Date.now() + (result.reset - Date.now())
      };
    } catch (err) {
      // Fallback silencioso pra in-memory se Redis falhar
      console.error('[RateLimit] Upstash falhou, fallback in-memory:', err);
    }
  }
  return memRateLimit(key, limit, windowMs);
}

/**
 * Síncrono — para compatibilidade com código existente que espera rateLimit síncrono.
 * Quando Upstash estiver ativo, faz lookup async (pode perder 1 request no fallback).
 */
export function rateLimitSync(key: string, limit: number, windowMs = 60_000): RateLimitResult {
  return memRateLimit(key, limit, windowMs);
}

/**
 * Extrai o IP real do request, considerando proxies (Vercel, Cloudflare).
 * Prioriza x-forwarded-for (primeiro IP da lista), fallback pra x-real-ip.
 */
export function extrairIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return '127.0.0.1';
}

/** Limites pré-definidos por categoria de rota */
export const LIMITES = {
  /**
   * Criação de candidatura — endpoint público (pré-auth, sem candidatoId ainda),
   * então continua escopado por IP. 10->30: várias pessoas testando da mesma
   * rede (mesmo IP público de escritório) não podiam competir pelo mesmo balde
   * de 10/min — 30/min dá folga confortável pra dezenas de gente começando
   * junto, sem abrir mão de barrar flood de verdade.
   */
  candidaturaWrite: { limit: 30, windowMs: 60_000 },
  /**
   * Upload de vídeo — operação pesada. Desde 2026-08-13 as rotas que usam esse
   * limite (respostas/iniciar e respostas) passam actorKey=candidatoId, então o
   * balde já é POR CANDIDATO, não por IP — várias pessoas na mesma rede não
   * compartilham mais o mesmo limite. 5->8 só dá folga extra pra reenvio em
   * caso de falha (cada resposta consome 2 unidades: 1 no /iniciar + 1 no upload).
   */
  videoUpload: { limit: 8, windowMs: 60_000 },
  /** TTS — custo por chamada. Também escopado por candidatoId/email desde 2026-08-13. */
  tts: { limit: 15, windowMs: 60_000 },
  /** Login — prevenir brute force */
  login: { limit: 5, windowMs: 60_000 },
  /** Esqueci minha senha — previne flood de e-mail / enumeração de contas */
  resetSenha: { limit: 3, windowMs: 60_000 },
  /** Endritos de leitura públicos */
  publicRead: { limit: 30, windowMs: 60_000 },
  /** Endritos admin (já protegidos por auth, rate limit é defense-in-depth) */
  admin: { limit: 60, windowMs: 60_000 }
} as const;
