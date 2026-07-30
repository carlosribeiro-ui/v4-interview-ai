import { NextRequest, NextResponse } from 'next/server';
import { lerSessao } from '@/lib/auth-edge';

/**
 * Protege as páginas internas (admin/talent). `/entrevista/*` (candidato), `/api/*`,
 * `/login` e `/docs` ficam de fora — candidato nunca loga, e a API tem seus próprios
 * checks (x-api-key para integrações externas; as rotas de mutação sensíveis do
 * painel checam a sessão internamente).
 */
export async function middleware(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/candidatos/:path*', '/relatorios/:path*', '/vagas/:path*', '/testar-entrevista/:path*', '/admin/:path*']
};
