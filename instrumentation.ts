/**
 * Rede de segurança de erros — Next.js 14.2+ chama `onRequestError` automaticamente
 * sempre que uma rota/página lança um erro não tratado (ex: exceção que escapou de
 * um try/catch, promise rejeitada não capturada num route handler). Sem isso, esses
 * erros só existem no `vercel logs` — ninguém é avisado a menos que alguém pense em
 * olhar o terminal.
 *
 * onRequestError roda TANTO no runtime Node quanto no Edge (middleware), e o Next
 * empacota este arquivo uma vez por runtime. Por isso ele NÃO pode importar
 * lib/logs.ts (que puxa o driver do MongoDB, incompatível com Edge) — usamos só
 * `console.error` (sempre visível em `vercel logs`) e `fetch` (funciona nos dois
 * runtimes) para um alerta opcional via webhook.
 */
export async function register() {
  // noop — export exigido pelo Next para ativar o instrumentation hook.
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routeType: string }
) {
  const mensagem = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack?.slice(0, 800) : undefined;

  console.error('[erro_sistema]', JSON.stringify({
    mensagem,
    path: request.path,
    method: request.method,
    routeType: context.routeType,
    stack
  }));

  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (!webhook) return;

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🔴 v4-interview-ai erro em produção\n${request.method} ${request.path}\n${mensagem}`.slice(0, 1000)
      })
    });
  } catch {
    // webhook é best-effort — nunca deve derrubar o tratamento de erro
  }
}
