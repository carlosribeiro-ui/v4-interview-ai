import { NextRequest, NextResponse } from 'next/server';
import { lerSessao } from '@/lib/auth-edge';
import type { Role } from '@/lib/auth-edge';

/**
 * Middleware centralizado: protege páginas internas (admin/talent) E rotas de API admin.
 *
 * Páginas: redireciona pra /login se não autenticado.
 * API admin: retorna 401/403 conforme role necessária.
 *
 * Endpoints públicos ficam de fora: /entrevista/*, /api/candidaturas (POST),
 * /api/vagas/publicas, /api/tts, /api/openapi.json, /api/auth/*.
 */

/** Rotas de API que exigem role específica (checado no middleware). */
const API_ADMIN_ROUTES: { pattern: RegExp; methods: string[]; role: Role }[] = [
  // Gerenciamento de usuários — admin only
  { pattern: /^\/api\/usuarios(?:\/.*)?$/, methods: ['POST', 'DELETE'], role: 'admin' },
  // Logs de auditoria — admin only
  { pattern: /^\/api\/logs$/, methods: ['GET'], role: 'admin' },
  // Editar/deletar vaga — admin only
  { pattern: /^\/api\/vagas\/[^/]+$/, methods: ['PATCH', 'DELETE'], role: 'admin' },
  // Gerenciar fases da vaga — admin only
  { pattern: /^\/api\/vagas\/[^/]+\/fases$/, methods: ['PATCH'], role: 'admin' },
  // Deletar candidatura — admin only
  { pattern: /^\/api\/candidaturas\/[^/]+$/, methods: ['DELETE'], role: 'admin' },
];

/** Rotas de API que exigem qualquer sessão autenticada (admin ou talent). */
const API_AUTH_ROUTES: { pattern: RegExp; methods: string[] }[] = [
  // Criar vaga — admin/talent
  { pattern: /^\/api\/vagas$/, methods: ['POST'] },
  // Notas internas — admin/talent
  { pattern: /^\/api\/candidaturas\/[^/]+\/notas$/, methods: ['POST'] },
  // Mover fase do candidato — admin/talent
  { pattern: /^\/api\/candidaturas\/[^/]+\/fase$/, methods: ['PATCH'] },
];

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const method = req.method;

  // ─── Proteção de API routes ───
  if (pathname.startsWith('/api/')) {
    // Verifica rotas que exigem role específica
    for (const route of API_ADMIN_ROUTES) {
      if (route.pattern.test(pathname) && route.methods.includes(method)) {
        const sessao = await lerSessao(req);
        if (!sessao) {
          return NextResponse.json({ error: 'Faça login para acessar este recurso' }, { status: 401 });
        }
        if (sessao.role !== route.role) {
          return NextResponse.json({ error: 'Permissão insuficiente' }, { status: 403 });
        }
        return NextResponse.next();
      }
    }

    // Verifica rotas que exigem qualquer sessão
    for (const route of API_AUTH_ROUTES) {
      if (route.pattern.test(pathname) && route.methods.includes(method)) {
        const sessao = await lerSessao(req);
        if (!sessao) {
          return NextResponse.json({ error: 'Faça login para acessar este recurso' }, { status: 401 });
        }
        return NextResponse.next();
      }
    }

    // Demais rotas de API seguem sem auth no middleware (auth feito na route handler)
    return NextResponse.next();
  }

  // ─── Proteção de páginas ───
  const sessao = await lerSessao(req);
  if (!sessao) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Páginas internas
    '/',
    '/candidatos/:path*',
    '/relatorios/:path*',
    '/vagas/:path*',
    '/testar-entrevista/:path*',
    '/admin/:path*',
    // API routes protegidas por RBAC
    '/api/usuarios/:path*',
    '/api/logs',
    '/api/vagas/:path*/fases',
    '/api/candidaturas/:path*/notas',
    '/api/candidaturas/:path*/fase',
  ]
};
