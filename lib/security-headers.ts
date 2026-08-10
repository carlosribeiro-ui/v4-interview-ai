import { NextResponse } from 'next/server';

/** Headers de segurança aplicados a todas as respostas. */
export function aplicarSecurityHeaders(res: NextResponse): NextResponse {
  // Impede clickjacking
  res.headers.set('X-Frame-Options', 'DENY');

  // Impede MIME sniffing
  res.headers.set('X-Content-Type-Options', 'nosniff');

  // Força HTTPS (2 anos + subdomínios)
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

  // Controle de referrer
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restringe features do navegador (câmera/mic só no entrevista)
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=()');

  // XSS legacy (defense-in-depth para navegadores antigos)
  res.headers.set('X-XSS-Protection', '1; mode=block');

  // CSP simplificado — Next.js 14 requer unsafe-inline pra styled-components e HMR
  // unsafe-eval REMOVIDO (V-11 fix) — Next.js production não precisa
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // Next.js HMR precisa de inline
      "style-src 'self' 'unsafe-inline'", // Tailwind gera inline
      "img-src 'self' data: blob: https://*.r2.dev https://*.cloudflare.com",
      "font-src 'self'",
      "connect-src 'self' https://generativelanguage.googleapis.com https://*.upstash.io",
      "media-src 'self' blob: https://*.r2.dev",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  );

  return res;
}
