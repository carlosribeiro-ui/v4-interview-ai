import { describe, it, expect } from 'vitest';

// Testes de integração pro middleware RBAC.
// Nota: estes testes verificam a LÓGICA de matching das rotas, não o middleware
// completo (que precisa de NextRequest com cookies). Testes E2E com Playwright
// seriam ideais pra cobrir o fluxo completo de auth.
//
// Nomenclatura: só candidatos/dashboard/relatorios/vagas ficam sob /api/ (colidem
// de verdade com uma página); o resto vive na raiz — ver middleware.ts::ehRotaApi.

describe('middleware RBAC - pattern matching', () => {
  // Patterns replicados do middleware.ts pra testar isoladamente
  const API_ADMIN_ROUTES: { pattern: RegExp; methods: string[] }[] = [
    { pattern: /^\/usuarios(?:\/.*)?$/, methods: ['POST', 'DELETE'] },
    { pattern: /^\/logs$/, methods: ['GET'] },
    { pattern: /^\/config\/email-templates$/, methods: ['GET', 'POST'] },
    { pattern: /^\/config\/email-templates\/[^/]+$/, methods: ['PATCH', 'DELETE'] },
    { pattern: /^\/config\/emails-enviados$/, methods: ['GET'] },
    { pattern: /^\/api\/vagas\/[^/]+$/, methods: ['PATCH', 'DELETE'] },
    { pattern: /^\/api\/vagas\/[^/]+\/fases$/, methods: ['PATCH'] },
    { pattern: /^\/candidaturas\/[^/]+$/, methods: ['DELETE'] },
  ];

  const API_AUTH_ROUTES: { pattern: RegExp; methods: string[] }[] = [
    { pattern: /^\/api\/vagas$/, methods: ['POST'] },
    { pattern: /^\/candidaturas\/[^/]+\/notas$/, methods: ['POST'] },
    { pattern: /^\/candidaturas\/[^/]+\/fase$/, methods: ['PATCH'] },
  ];

  const PREFIXOS_API_BARE = [
    '/auth', '/candidaturas', '/config', '/integracoes', '/usuarios',
    '/health', '/logs', '/openapi.json', '/tts', '/analisar-perguntas'
  ];

  function ehRotaApi(pathname: string): boolean {
    if (pathname.startsWith('/api/')) return true;
    return PREFIXOS_API_BARE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }

  function matchRoute(
    pathname: string,
    method: string,
    routes: { pattern: RegExp; methods: string[] }[]
  ): boolean {
    return routes.some((r) => r.pattern.test(pathname) && r.methods.includes(method));
  }

  it('protege DELETE /usuarios/[id] como admin', () => {
    expect(matchRoute('/usuarios/abc-123', 'DELETE', API_ADMIN_ROUTES)).toBe(true);
  });

  it('protege POST /usuarios como admin', () => {
    expect(matchRoute('/usuarios', 'POST', API_ADMIN_ROUTES)).toBe(true);
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

  it('protege DELETE /candidaturas/[id] como admin', () => {
    expect(matchRoute('/candidaturas/abc-123', 'DELETE', API_ADMIN_ROUTES)).toBe(true);
  });

  it('protege GET /logs como admin', () => {
    expect(matchRoute('/logs', 'GET', API_ADMIN_ROUTES)).toBe(true);
  });

  it('protege POST /config/email-templates como admin', () => {
    expect(matchRoute('/config/email-templates', 'POST', API_ADMIN_ROUTES)).toBe(true);
  });

  it('protege GET /config/emails-enviados como admin', () => {
    expect(matchRoute('/config/emails-enviados', 'GET', API_ADMIN_ROUTES)).toBe(true);
  });

  it('NÃO protege GET /api/vagas/[id] (leitura pública)', () => {
    expect(matchRoute('/api/vagas/abc-123', 'GET', API_ADMIN_ROUTES)).toBe(false);
  });

  it('NÃO protege GET /candidaturas/[id] (leitura pública)', () => {
    expect(matchRoute('/candidaturas/abc-123', 'GET', API_ADMIN_ROUTES)).toBe(false);
  });

  it('protege POST /api/vagas como auth (admin/talent)', () => {
    expect(matchRoute('/api/vagas', 'POST', API_AUTH_ROUTES)).toBe(true);
  });

  it('protege POST /candidaturas/[id]/notas como auth', () => {
    expect(matchRoute('/candidaturas/abc-123/notas', 'POST', API_AUTH_ROUTES)).toBe(true);
  });

  it('protege PATCH /candidaturas/[id]/fase como auth', () => {
    expect(matchRoute('/candidaturas/abc-123/fase', 'PATCH', API_AUTH_ROUTES)).toBe(true);
  });

  it('NÃO protege POST /candidaturas (criação pública)', () => {
    expect(matchRoute('/candidaturas', 'POST', API_AUTH_ROUTES)).toBe(false);
  });

  it('NÃO protege POST /tts (público)', () => {
    expect(matchRoute('/tts', 'POST', API_AUTH_ROUTES)).toBe(false);
  });

  it('NÃO protege POST /auth/login (público)', () => {
    expect(matchRoute('/auth/login', 'POST', API_AUTH_ROUTES)).toBe(false);
  });

  describe('ehRotaApi', () => {
    it('reconhece os 4 namespaces que ficaram sob /api/', () => {
      expect(ehRotaApi('/api/candidatos')).toBe(true);
      expect(ehRotaApi('/api/dashboard')).toBe(true);
      expect(ehRotaApi('/api/relatorios')).toBe(true);
      expect(ehRotaApi('/api/vagas/abc-123')).toBe(true);
    });

    it('reconhece os namespaces que viraram bare path', () => {
      expect(ehRotaApi('/auth/login')).toBe(true);
      expect(ehRotaApi('/candidaturas/abc-123')).toBe(true);
      expect(ehRotaApi('/config/webhooks')).toBe(true);
      expect(ehRotaApi('/integracoes/vagas')).toBe(true);
      expect(ehRotaApi('/usuarios')).toBe(true);
      expect(ehRotaApi('/health')).toBe(true);
      expect(ehRotaApi('/logs')).toBe(true);
      expect(ehRotaApi('/openapi.json')).toBe(true);
      expect(ehRotaApi('/tts')).toBe(true);
      expect(ehRotaApi('/analisar-perguntas')).toBe(true);
    });

    it('NÃO confunde página com API de mesmo nome parcial', () => {
      expect(ehRotaApi('/candidatos')).toBe(false); // kanban global — página, não API
      expect(ehRotaApi('/dashboard')).toBe(false);
      expect(ehRotaApi('/relatorios')).toBe(false);
      expect(ehRotaApi('/vagas/abc-123')).toBe(false); // página de detalhe da vaga
      expect(ehRotaApi('/admin/config')).toBe(false);
      expect(ehRotaApi('/login')).toBe(false);
    });
  });
});
