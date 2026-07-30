'use client';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h2>Erro na aplicação</h2>
        <p>{error.message}</p>
        <button onClick={reset}>Tentar novamente</button>
      </body>
    </html>
  );
}
