/**
 * Monitoramento de erros — wrapper leve que pode ser conectado a Sentry/Datadog/qualquer APM.
 * Por enquanto, erros são logados em formato estruturado no console (Vercel captura automaticamente).
 *
 * Para ativar Sentry no futuro:
 * 1. npm install @sentry/nextjs
 * 2. Adicionar SENTRY_DSN no .env.local
 * 3. Descomentar o bloco Sentry.init abaixo
 */

const SENTRY_DSN = process.env.SENTRY_DSN || '';

// TODO: Descomentar quando instalar @sentry/nextjs
// import * as Sentry from '@sentry/nextjs';
// if (SENTRY_DSN) {
//   Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: 0.1 });
// }

type ErrorContext = {
  /** Rota onde o erro ocorreu (ex: /api/candidaturas/[id]/respostas) */
  route?: string;
  /** ID da candidatura afetada */
  candidaturaId?: string;
  /** ID da vaga afetada */
  vagaId?: string;
  /** Email do usuário afetado */
  userEmail?: string;
  /** Dados adicionais relevantes */
  extra?: Record<string, unknown>;
};

/**
 * Registra erro de forma estruturada. Chamada em catch blocks das route handlers.
 * Em produção, Vercel captura automatically logs de console.error.
 * Se SENTRY_DSN estiver configurado, também enviará pro Sentry (quando ativado).
 */
export function reportarErro(err: unknown, context?: ErrorContext): void {
  const erro = err instanceof Error ? err : new Error(String(err));
  const payload = {
    message: erro.message,
    stack: erro.stack,
    ...context,
    timestamp: new Date().toISOString()
  };

  // Log estruturado — Vercel Function Logs captura automaticamente
  console.error('[ERROR]', JSON.stringify(payload));

  // TODO: Descomentar quando instalar @sentry/nextjs
  // if (SENTRY_DSN) {
  //   Sentry.withScope((scope) => {
  //     if (context?.route) scope.setTag('route', context.route);
  //     if (context?.candidaturaId) scope.setTag('candidaturaId', context.candidaturaId);
  //     if (context?.vagaId) scope.setTag('vagaId', context.vagaId);
  //     if (context?.extra) scope.setExtras(context.extra);
  //     Sentry.captureException(erro);
  //   });
  // }
}

/**
 * Registra evento de warning — não é erro, mas merece atenção.
 */
export function reportarWarning(message: string, context?: ErrorContext): void {
  const payload = {
    level: 'warning',
    message,
    ...context,
    timestamp: new Date().toISOString()
  };
  console.warn('[WARN]', JSON.stringify(payload));
}
