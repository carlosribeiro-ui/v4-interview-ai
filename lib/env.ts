/**
 * Validação centralizada de variáveis de ambiente com Zod.
 * Roda na primeira importação — falha rápido se faltar algo.
 */

import { z } from 'zod';

const envSchema = z.object({
  // ─── Obrigatórias ───
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET deve ter ao menos 32 caracteres'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI é obrigatória'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY é obrigatória'),

  // ─── R2 (Storage) ───
  R2_ENDPOINT: z.string().url().optional().default(''),
  R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID é obrigatória'),
  R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY é obrigatória'),
  R2_BUCKET: z.string().min(1, 'R2_BUCKET é obrigatório'),
  R2_PUBLIC_URL: z.string().url().optional().default(''),

  // ─── API Externa ───
  EXTERNAL_API_KEY: z.string().optional().default(''),

  // ─── Seeds ───
  SEED_ADMIN_SENHA: z.string().optional(),
  SEED_TALENT_SENHA: z.string().optional(),

  // ─── Upstash (rate limiting cross-instance) ───
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // ─── Sentry (opcional) ───
  SENTRY_DSN: z.string().optional(),

  // ─── CORS (allowlist de origins para rotas de integração) ───
  CORS_ALLOWED_ORIGINS: z.string().optional(),
});

// Validação lazy — só roda na primeira chamada
let _env: z.infer<typeof envSchema> | null = null;

export function getEnv() {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`[Env] Variáveis de ambiente inválidas:\n${issues}`);
    // Em dev, throw. Em produção, loga mas não derruba (pode ter fallback).
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
    }
  }

  _env = (result.success ? result.data : envSchema.parse({
    ...Object.fromEntries(Object.entries(process.env).filter(([_, v]) => v !== undefined)),
    // V-14 FIX: NÃO usar fallback em produção — SESSION_SECRET é obrigatório
    SESSION_SECRET: process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production'
      ? '' // Força erro em produção
      : 'dev-only-min-32-chars-long-for-local-dev!!'),
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'placeholder',
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || 'placeholder',
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || 'placeholder',
    R2_BUCKET: process.env.R2_BUCKET || 'placeholder',
  })) as z.infer<typeof envSchema>;

  return _env;
}
