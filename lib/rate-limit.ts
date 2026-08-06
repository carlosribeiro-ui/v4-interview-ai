/**
 * Rate limiter em memória — suficiente pra Vercel serverless (cada cold start reseta,
 * mas previne abuse contínuo dentro de uma mesma instância). Cada IP rastreia janela
 * de 60s com contador de requisições.
 *
 * Se precisar de persistência cross-instance no futuro, trocar por Upstash Redis
 * (free tier: 10k comandos/dia).
 */

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

// Limpa entradas expiradas a cada 5 min pra não vazar memória
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Verifica se a requisição está dentro do limite.
 * @param key     Chave única (geralmente IP + rota)
 * @param limit   Máximo de requisições na janela
 * @param windowMs  Duração da janela em ms (default: 60s)
 */
export function rateLimit(key: string, limit: number, windowMs = 60_000): RateLimitResult {
  cleanup();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  entry.count++;

  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
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
  /** Endritos públicos de interview — prevenir flood de candidaturas */
  candidaturaWrite: { limit: 10, windowMs: 60_000 },
  /** Upload de vídeo — operação pesada */
  videoUpload: { limit: 5, windowMs: 60_000 },
  /** TTS — custo por chamada */
  tts: { limit: 15, windowMs: 60_000 },
  /** Login — prevenir brute force */
  login: { limit: 5, windowMs: 60_000 },
  /** Endritos de leitura públicos */
  publicRead: { limit: 30, windowMs: 60_000 },
  /** Endritos admin (já protegidos por auth, rate limit é defense-in-depth) */
  admin: { limit: 60, windowMs: 60_000 }
} as const;
