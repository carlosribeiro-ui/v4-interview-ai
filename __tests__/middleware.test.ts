import { describe, it, expect } from 'vitest';

// Testes de integração pro middleware RBAC.
// Nota: estes testes verificam a LÓGICA de matching das rotas, não o middleware
// completo (que precisa de NextRequest com cookies). Testes E2E com Playwright
// seriam ideais pra cobrir o fluxo completo de auth.

describe('middleware RBAC - pattern matching', () => {
  // Patterns replicados do middleware.ts pra testar isoladamente
  const API_ADMIN_ROUTES: { pattern: RegExp; methods: string[] }[] = [
    { pattern: /^\/api\/usuarios(?:\/.*)?$/, methods: ['POST', 'DELETE'] },
    { pattern: /^\/api\/logs$/, methods: ['GET'] },
    { pattern: /^\/api\/vagas\/[^/]+$/, methods: ['PATCH', 'DELETE'] },
    { pattern: /^\/api\/vagas\/[^/]+\/fases$/, methods: ['PATCH'] },
    { pattern: /^\/api\/candidaturas\/[^/]+$/, methods: ['DELETE'] },
  ];

  const API_AUTH_ROUTES: { pattern: RegExp; methods: string[] }[] = [
    { pattern: /^\/api\/vagas$/, methods: ['POST'] },
    { pattern: /^\/api\/candidaturas\/[^/]+\/notas$/, methods: ['POST'] },
    { pattern: /^\/api\/candidaturas\/[^/]+\/fase$/, methods: ['PATCH'] },
  ];

  function matchRoute(
    pathname: string,
    method: string,
    routes: { pattern: RegExp; methods: string[] }[]
  ): boolean {
    return routes.some((r) => r.pattern.test(pathname) && r.methods.includes(method));
  }

  it('protege DELETE /api/usuarios/[id] como admin', () => {
    expect(matchRoute('/api/usuarios/abc-123', 'DELETE', API_ADMIN_ROUTES)).toBe(true);
  });

  it('protege POST /api/usuarios como admin', () => {
    expect(matchRoute('/api/usuarios', 'POST', API_ADMIN_ROUTES)).toBe(true);
  });

  it('protege PATCH /api/vagas/[id] como admin', () => {
    expect(matchRoute('/api/vagas/abc-123', 'PATCH', API_ADMIN_ROUTES)).toBe(true);
  });

  it('protege DELETE /api/vagas/[id] como admin', () => {
    expect(matchRoute('/api/vagas/abc-123', 'DELETE', API_ADMIN_ROUTES)).toBe(true);
  });

  it('protege PATCH /api/vagas/[id]/fases como admin', () => {
    expect(matchRoute('/api/vagas/abc-123/fases', 'PATCH', API_ADMIN_ROUTES)).toBe(true);
  });

  it('protege DELETE /api/candidaturas/[id] como admin', () => {
    expect(matchRoute('/api/candidaturas/abc-123', 'DELETE', API_ADMIN_ROUTES)).toBe(true);
  });

  it('protege GET /api/logs como admin', () => {
    expect(matchRoute('/api/logs', 'GET', API_ADMIN_ROUTES)).toBe(true);
  });

  it('NÃO protege GET /api/vagas/[id] (leitura pública)', () => {
    expect(matchRoute('/api/vagas/abc-123', 'GET', API_ADMIN_ROUTES)).toBe(false);
  });

  it('NÃO protege GET /api/candidaturas/[id] (leitura pública)', () => {
    expect(matchRoute('/api/candidaturas/abc-123', 'GET', API_ADMIN_ROUTES)).toBe(false);
  });

  it('protege POST /api/vagas como auth (admin/talent)', () => {
    expect(matchRoute('/api/vagas', 'POST', API_AUTH_ROUTES)).toBe(true);
  });

  it('protege POST /api/candidaturas/[id]/notas como auth', () => {
    expect(matchRoute('/api/candidaturas/abc-123/notas', 'POST', API_AUTH_ROUTES)).toBe(true);
  });

  it('protege PATCH /api/candidaturas/[id]/fase como auth', () => {
    expect(matchRoute('/api/candidaturas/abc-123/fase', 'PATCH', API_AUTH_ROUTES)).toBe(true);
  });

  it('NÃO protege POST /api/candidaturas (criação pública)', () => {
    expect(matchRoute('/api/candidaturas', 'POST', API_AUTH_ROUTES)).toBe(false);
  });

  it('NÃO protege POST /api/tts (público)', () => {
    expect(matchRoute('/api/tts', 'POST', API_AUTH_ROUTES)).toBe(false);
  });

  it('NÃO protege POST /api/auth/login (público)', () => {
    expect(matchRoute('/api/auth/login', 'POST', API_AUTH_ROUTES)).toBe(false);
  });
});
