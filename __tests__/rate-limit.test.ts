import { describe, it, expect } from 'vitest';
import { rateLimit, extrairIP } from '../lib/rate-limit';

describe('rate-limit', () => {
  it('permite requisições dentro do limite', () => {
    const result = rateLimit('test-key', 3, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('bloqueia quando excede o limite', () => {
    const key = 'test-block-' + Date.now();
    rateLimit(key, 2, 60000);
    rateLimit(key, 2, 60000);
    const result = rateLimit(key, 2, 60000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('reseta após janela de tempo', async () => {
    const key = 'test-reset-' + Date.now();
    rateLimit(key, 1, 100); // 100ms window
    const blocked = rateLimit(key, 1, 100);
    expect(blocked.allowed).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 150));
    const after = rateLimit(key, 1, 100);
    expect(after.allowed).toBe(true);
  });
});

describe('extrairIP', () => {
  it('extrai IP de x-forwarded-for', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }
    });
    expect(extrairIP(req)).toBe('1.2.3.4');
  });

  it('fallback pra 127.0.0.1 sem headers', () => {
    const req = new Request('http://localhost');
    expect(extrairIP(req)).toBe('127.0.0.1');
  });
});
