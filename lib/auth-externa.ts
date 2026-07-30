import { NextRequest, NextResponse } from 'next/server';

/**
 * Autenticação das rotas /api/integracoes/* (chamadas por sistemas externos,
 * ex: n8n). Chave fixa via header — suficiente pro estágio local/MVP, não é
 * um esquema de auth completo (sem rotação, sem escopos).
 */
export function checarChaveExterna(req: NextRequest): NextResponse | null {
  const chaveConfigurada = process.env.EXTERNAL_API_KEY;
  if (!chaveConfigurada) {
    return NextResponse.json(
      { error: 'EXTERNAL_API_KEY não configurada no servidor (.env.local)' },
      { status: 500 }
    );
  }

  const chaveRecebida = req.headers.get('x-api-key');
  if (chaveRecebida !== chaveConfigurada) {
    return NextResponse.json({ error: 'x-api-key inválida ou ausente' }, { status: 401 });
  }

  return null;
}
