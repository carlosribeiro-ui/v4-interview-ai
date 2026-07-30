/** Gráfico de barras verticais simples (SVG puro) — distribuição de notas. */
export default function GraficoBarras({ dados }: { dados: { faixa: string; total: number }[] }) {
  const max = Math.max(1, ...dados.map((d) => d.total));
  const cores = ['#E50914', '#FFC02A', '#FFC02A', '#52CC5A', '#52CC5A'];

  return (
    <div className="flex items-end justify-between gap-3 h-40 px-1">
      {dados.map((d, i) => (
        <div key={d.faixa} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
          {d.total > 0 && <span className="text-xs font-semibold text-white/80">{d.total}</span>}
          <div
            className="w-full rounded-t-lg transition-all"
            style={{
              height: `${Math.max(4, (d.total / max) * 100)}%`,
              backgroundColor: cores[i % cores.length],
              opacity: d.total === 0 ? 0.15 : 0.9
            }}
          />
          <span className="text-[10px] text-white/40">{d.faixa}</span>
        </div>
      ))}
    </div>
  );
}
