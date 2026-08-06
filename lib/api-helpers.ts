import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, extrairIP, LIMITES } from './rate-limit';

/**
 * Aplica rate limiting e retorna null se permitido, ou NextResponse 429 se excedido.
 * Usado diretamente nas route handlers pra não repetir lógica.
 */
export function aplicarRateLimit(
  req: NextRequest,
  chave: string,
  config: { limit: number; windowMs: number }
): NextResponse | null {
  const ip = extrairIP(req);
  const resultado = rateLimit(`${ip}:${chave}`, config.limit, config.windowMs);

  if (!resultado.allowed) {
    return NextResponse.json(
      { error: 'Muitas requisições. Tente novamente em alguns segundos.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((resultado.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Limit': String(config.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(resultado.resetAt / 1000))
        }
      }
    );
  }

  return null;
}

export { LIMITES };
