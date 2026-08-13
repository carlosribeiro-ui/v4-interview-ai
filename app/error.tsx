'use client';

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Algo deu errado</h2>
      <p className="text-sm text-fg/60">{error.message}</p>
      <button
        onClick={reset}
        className="rounded border border-fg/20 px-4 py-2 text-sm hover:bg-fg/10 transition"
      >
        Tentar novamente
      </button>
    </div>
  );
}
