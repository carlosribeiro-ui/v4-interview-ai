import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, extrairIP, LIMITES } from './rate-limit';

/**
 * Aplica rate limiting e retorna null se permitido, ou NextResponse 429 se excedido.
 * Usado diretamente nas route handlers pra não repetir lógica.
 * Agora é async — usa Upstash Redis quando disponível.
 *
 * `actorKey` (opcional): quando a rota já autenticou a sessão, passe um
 * identificador estável do usuário (ex: sessao.email). Isso separa o balde
 * de rate limit POR USUÁRIO em vez de por IP — essencial para rotas admin/talent,
 * onde vários colegas atrás do mesmo IP de escritório NÃO podem compartilhar
 * (e esgotar) o mesmo limite. Rotas pré-auth (login, upload público de candidato)
 * continuam por IP, que é o comportamento certo pra prevenir brute-force/flood.
 */
export async function aplicarRateLimit(
  req: NextRequest,
  chave: string,
  config: { limit: number; windowMs: number },
  actorKey?: string
): Promise<NextResponse | null> {
  const escopo = actorKey || extrairIP(req);
  const resultado = await rateLimit(`${escopo}:${chave}`, config.limit, config.windowMs);

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
