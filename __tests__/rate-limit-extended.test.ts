import { describe, it, expect } from 'vitest';
import { rateLimitSync, extrairIP, LIMITES } from '../lib/rate-limit';

describe('rate-limit - LIMITES', () => {
  it('login: 5 req/min', () => {
    expect(LIMITES.login.limit).toBe(5);
    expect(LIMITES.login.windowMs).toBe(60_000);
  });

  it('candidaturaWrite: 30 req/min', () => {
    expect(LIMITES.candidaturaWrite.limit).toBe(30);
  });

  it('videoUpload: 8 req/min', () => {
    expect(LIMITES.videoUpload.limit).toBe(8);
  });

  it('tts: 15 req/min', () => {
    expect(LIMITES.tts.limit).toBe(15);
  });

  it('publicRead: 30 req/min', () => {
    expect(LIMITES.publicRead.limit).toBe(30);
  });

  it('admin: 60 req/min', () => {
    expect(LIMITES.admin.limit).toBe(60);
  });
});

describe('rate-limit - isolamento de keys', () => {
  it('chaves diferentes não interferem entre si', () => {
    const keyA = 'iso-a-' + Date.now();
    const keyB = 'iso-b-' + Date.now();

    rateLimitSync(keyA, 1, 60000);
    rateLimitSync(keyA, 1, 60000); // bloqueia A

    const resultB = rateLimitSync(keyB, 1, 60000);
    expect(resultB.allowed).toBe(true); // B ainda está limpo
  });
});

describe('rate-limit - edge cases', () => {
  it('limite 1: primeira passa, segunda bloqueia', () => {
    const key = 'edge-1-' + Date.now();
    expect(rateLimitSync(key, 1, 60000).allowed).toBe(true);
    expect(rateLimitSync(key, 1, 60000).allowed).toBe(false);
  });

  it('remaining decrementa corretamente', () => {
    const key = 'edge-rem-' + Date.now();
    expect(rateLimitSync(key, 3, 60000).remaining).toBe(2);
    expect(rateLimitSync(key, 3, 60000).remaining).toBe(1);
    expect(rateLimitSync(key, 3, 60000).remaining).toBe(0);
  });

  it('resetAt é futuro', () => {
    const key = 'edge-reset-' + Date.now();
    const result = rateLimitSync(key, 10, 60000);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});

describe('extrairIP - edge cases', () => {
  it('x-real-ip como fallback', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-real-ip': '5.6.7.8' }
    });
    expect(extrairIP(req)).toBe('5.6.7.8');
  });

  it('x-forwarded-for tem prioridade sobre x-real-ip', () => {
    const req = new Request('http://localhost', {
      headers: {
        'x-forwarded-for': '1.2.3.4',
        'x-real-ip': '5.6.7.8'
      }
    });
    expect(extrairIP(req)).toBe('1.2.3.4');
  });

  it('extrai primeiro IP da lista x-forwarded-for', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2, 10.0.0.3' }
    });
    expect(extrairIP(req)).toBe('10.0.0.1');
  });

  it('ip privado retorna correto', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '192.168.1.1' }
    });
    expect(extrairIP(req)).toBe('192.168.1.1');
  });
});
