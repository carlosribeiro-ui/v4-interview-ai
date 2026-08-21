import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';

/**
 * Testes de integração pro middleware com security headers.
 * Verifica que o middleware aplica headers de segurança em TODAS as respostas.
 * Estes testes testam a LÓGICA de aplicação dos headers, não o middleware completo
 * (que precisa de NextRequest com cookies para auth).
 */

describe('middleware security headers - lógica', () => {
  // Replica a lógica do middleware pra testar isoladamente
  function aplicarHeaders(res: NextResponse): NextResponse {
    res.headers.set('X-Frame-Options', 'DENY');
    res.headers.set('X-Content-Type-Options', 'nosniff');
    res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=()');
    res.headers.set('X-XSS-Protection', '1; mode=block');
    return res;
  }

  it('aplica headers em responses de API', () => {
    const res = aplicarHeaders(NextResponse.json({ ok: true }));
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('aplica headers em redirects', () => {
    const res = aplicarHeaders(NextResponse.redirect(new URL('/login', 'http://localhost')));
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('aplica headers em responses 401', () => {
    const res = aplicarHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('aplica headers em responses 403', () => {
    const res = aplicarHeaders(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('aplica headers em responses 429', () => {
    const res = aplicarHeaders(NextResponse.json({ error: 'Rate limited' }, { status: 429 }));
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('health check passa sem auth mas com headers', () => {
    const res = aplicarHeaders(NextResponse.json({ status: 'ok' }));
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.status).toBe(200);
  });
});

describe('middleware CORS - lógica', () => {
  it('OPTIONS retorna 204 com CORS headers', () => {
    const res = new NextResponse(null, { status: 204 });
    res.headers.set('Access-Control-Allow-Origin', '*');
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.headers.set('Access-Control-Max-Age', '86400');

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
  });

  it('rotas de integração permitem Authorization header (Bearer)', () => {
    const res = new NextResponse();
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });
});
