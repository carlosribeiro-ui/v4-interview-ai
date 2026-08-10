import { describe, it, expect } from 'vitest';
import { aplicarSecurityHeaders } from '../lib/security-headers';
import { NextResponse } from 'next/server';

describe('security-headers', () => {
  it('aplica X-Frame-Options DENY', () => {
    const res = aplicarSecurityHeaders(new NextResponse());
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('aplica X-Content-Type-Options nosniff', () => {
    const res = aplicarSecurityHeaders(new NextResponse());
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('aplica HSTS com 2 anos', () => {
    const res = aplicarSecurityHeaders(new NextResponse());
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=63072000');
    expect(res.headers.get('Strict-Transport-Security')).toContain('includeSubDomains');
    expect(res.headers.get('Strict-Transport-Security')).toContain('preload');
  });

  it('aplica Referrer-Policy', () => {
    const res = aplicarSecurityHeaders(new NextResponse());
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('aplica Permissions-Policy com camera negada', () => {
    const res = aplicarSecurityHeaders(new NextResponse());
    const pp = res.headers.get('Permissions-Policy');
    expect(pp).toContain('camera=()');
    expect(pp).toContain('geolocation=()');
  });

  it('aplica Permissions-Policy com microphone permitido', () => {
    const res = aplicarSecurityHeaders(new NextResponse());
    const pp = res.headers.get('Permissions-Policy');
    expect(pp).toContain('microphone=(self)');
  });

  it('aplica X-XSS-Protection', () => {
    const res = aplicarSecurityHeaders(new NextResponse());
    expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
  });

  it('aplica Content-Security-Policy', () => {
    const res = aplicarSecurityHeaders(new NextResponse());
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it('CSP permite imagens do R2', () => {
    const res = aplicarSecurityHeaders(new NextResponse());
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain('img-src');
    expect(csp).toContain('r2.dev');
  });

  it('CSP permite conexões com Gemini e Upstash', () => {
    const res = aplicarSecurityHeaders(new NextResponse());
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain('generativelanguage.googleapis.com');
    expect(csp).toContain('upstash.io');
  });

  it('não modifica o body da resposta', () => {
    const original = new NextResponse('hello');
    aplicarSecurityHeaders(original);
    // NextResponse não tem .body legível, mas não deve dar erro
  });

  it('retorna a mesma resposta (mutação in-place)', () => {
    const res = new NextResponse();
    const returned = aplicarSecurityHeaders(res);
    expect(returned).toBe(res);
  });
});
