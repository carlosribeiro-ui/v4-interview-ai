/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '30mb'
    },
    // Habilita instrumentation.ts (register/onRequestError) — captura de erros
    // não tratados em produção, gravados na coleção `logs`.
    instrumentationHook: true
  },

  // Security headers como defense-in-depth (middleware já aplica, mas next.config é camada extra)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=()' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
      // CORS para rotas de integração — headers dinâmicos aplicados no middleware
      // (next.config.js NÃO deve setar CORS estático — o middleware reflete a origem)
    ];
  },
};

module.exports = nextConfig;
