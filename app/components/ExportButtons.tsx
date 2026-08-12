'use client';

/** Par de botões CSV/PDF reaproveitado em todo export tabular (candidatos, relatórios, dashboard, logs). */
export default function ExportButtons({
  onExport,
  className = ''
}: {
  onExport: (formato: 'csv' | 'pdf') => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <button
        onClick={() => onExport('csv')}
        className="rounded-full bg-v4green/15 text-v4green hover:bg-v4green/25 font-semibold px-3.5 py-2 text-sm transition"
      >
        ⬇ CSV
      </button>
      <button
        onClick={() => onExport('pdf')}
        className="rounded-full bg-v4red/15 text-v4red hover:bg-v4red/25 font-semibold px-3.5 py-2 text-sm transition"
      >
        ⬇ PDF
      </button>
    </div>
  );
}
