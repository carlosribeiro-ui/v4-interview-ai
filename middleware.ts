import { NextRequest, NextResponse } from 'next/server';
import { lerSessao } from '@/lib/auth-edge';
import type { Role } from '@/lib/auth-edge';
import { aplicarSecurityHeaders } from '@/lib/security-headers';

/**
 * Middleware centralizado: protege páginas internas (admin/talent) E rotas de API admin.
 * Aplica security headers em TODA resposta.
 *
 * Páginas: redireciona pra /login se não autenticado.
 * API admin: retorna 401/403 conforme role necessária.
 *
 * Endritos públicos ficam de fora: /entrevista/*, /api/candidaturas (POST),
 * /api/vagas/publicas, /api/tts, /api/openapi.json, /api/auth/*.
 */

/**
 * V-SEC: Allowlist de origins permitidas para CORS nas rotas de integração.
 * Adicione domínios conhecidos (n8n, Pipefy, etc.) via env var CORS_ALLOWED_ORIGINS
 * separados por vírgula. Se não configurado, bloqueia CORS (mais seguro).
 */
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

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

  // ─── Health check sempre passa ───
  if (pathname === '/api/health') {
    return aplicarSecurityHeaders(NextResponse.next());
  }

  // ─── CORS para rotas de integração (V-SEC: allowlist, não wildcard) ───
  if (pathname.startsWith('/api/integracoes/')) {
    const origin = req.headers.get('origin') || '';
    const originPermitida = CORS_ALLOWED_ORIGINS.includes(origin);

    if (method === 'OPTIONS') {
      const res = new NextResponse(null, { status: 204 });
      if (originPermitida) {
        res.headers.set('Access-Control-Allow-Origin', origin);
        res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
        res.headers.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
        res.headers.set('Access-Control-Max-Age', '86400');
      }
      return aplicarSecurityHeaders(res);
    }

    // V-SEC: Se origin não está na allowlist, não aplica headers CORS
    // (o request ainda passa — auth por x-api-key — mas o browser bloqueia a resposta)
    if (!originPermitida && origin) {
      return aplicarSecurityHeaders(
        NextResponse.json({ error: 'Origin não permitida' }, { status: 403 })
      );
    }
    // Continua pra auth check abaixo
  }

  // ─── Proteção de API routes ───
  if (pathname.startsWith('/api/')) {
    // Verifica rotas que exigem role específica
    for (const route of API_ADMIN_ROUTES) {
      if (route.pattern.test(pathname) && route.methods.includes(method)) {
        const sessao = await lerSessao(req);
        if (!sessao) {
          return aplicarSecurityHeaders(
            NextResponse.json({ error: 'Faça login para acessar este recurso' }, { status: 401 })
          );
        }
        if (sessao.role !== route.role) {
          return aplicarSecurityHeaders(
            NextResponse.json({ error: 'Permissão insuficiente' }, { status: 403 })
          );
        }
        return aplicarSecurityHeaders(NextResponse.next());
      }
    }

    // Verifica rotas que exigem qualquer sessão
    for (const route of API_AUTH_ROUTES) {
      if (route.pattern.test(pathname) && route.methods.includes(method)) {
        const sessao = await lerSessao(req);
        if (!sessao) {
          return aplicarSecurityHeaders(
            NextResponse.json({ error: 'Faça login para acessar este recurso' }, { status: 401 })
          );
        }
        return aplicarSecurityHeaders(NextResponse.next());
      }
    }

    // Demais rotas de API seguem sem auth no middleware (auth feito na route handler)
    return aplicarSecurityHeaders(NextResponse.next());
  }

  // ─── Proteção de páginas ───
  const sessao = await lerSessao(req);
  if (!sessao) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', req.nextUrl.pathname);
    return aplicarSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return aplicarSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    // Páginas internas
    '/',
    '/candidatos/:path*',
    '/dashboard/:path*',
    '/relatorios/:path*',
    '/vagas/:path*',
    '/testar-entrevista/:path*',
    '/admin/:path*',
    '/docs/:path*',
    // API routes protegidas por RBAC
    '/api/usuarios/:path*',
    '/api/logs',
    '/api/vagas/:path*/fases',
    '/api/candidaturas/:path*/notas',
    '/api/candidaturas/:path*/fase',
  ]
};
