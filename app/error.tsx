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
      <p className="text-sm text-white/60">{error.message}</p>
      <button
        onClick={reset}
        className="rounded border border-white/20 px-4 py-2 text-sm hover:bg-white/10 transition"
      >
        Tentar novamente
      </button>
    </div>
  );
}
