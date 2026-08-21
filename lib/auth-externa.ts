import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * Autenticação das rotas /integracoes/* (chamadas por sistemas externos,
 * ex: n8n, Pipefy). Chave fixa via header — suficiente pro estágio
 * local/MVP, não é um esquema de auth completo (sem rotação, sem escopos,
 * uma única chave global pra todo integrador).
 *
 * Único formato aceito, comparado contra EXTERNAL_API_KEY:
 *   - `Authorization: Bearer <chave>` — padrão HTTP (RFC 6750), reconhecido
 *     nativamente por Postman, n8n (credencial "Bearer Token" no HTTP
 *     Request node), curl, etc.
 *
 * `x-api-key` foi REMOVIDO em 21/08/2026 (era o legado, mantido só por
 * compatibilidade) — decisão explícita do usuário: menos formatos aceitos =
 * menos superfície de auth pra manter/atacar. Se algum integrador antigo
 * ainda mandar x-api-key, passa a receber 401 — não há mais fallback.
 *
 * Usa timingSafeEqual pra prevenir timing attacks — comparação de strings
 * com !== vaza informação byte a byte via tempo de resposta.
 */
export function checarChaveExterna(req: NextRequest): NextResponse | null {
  const chaveConfigurada = process.env.EXTERNAL_API_KEY;
  if (!chaveConfigurada) {
    return NextResponse.json(
      { error: 'EXTERNAL_API_KEY não configurada no servidor (.env.local)' },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get('authorization') || '';
  const chaveRecebida = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

  const bufRecebida = Buffer.from(chaveRecebida, 'utf-8');
  const bufConfigurada = Buffer.from(chaveConfigurada, 'utf-8');

  if (bufRecebida.length !== bufConfigurada.length || !timingSafeEqual(bufRecebida, bufConfigurada)) {
    return NextResponse.json(
      { error: 'Autenticação inválida ou ausente — use "Authorization: Bearer <chave>"' },
      { status: 401 }
    );
  }

  return null;
}
