const CORES = ['#E50914', '#FFC02A', '#52CC5A', '#B20710', '#E57373'];

/** Barra de progresso fina com label + %, usada nas métricas de qualidade/competência por pergunta. */
export default function Barra({ label, valor, corIndice = 0 }: { label: string; valor: number; corIndice?: number }) {
  const pct = Math.max(0, Math.min(100, valor));
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-white/70">{label}</span>
        <span className="font-semibold text-white/90">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: CORES[corIndice % CORES.length] }}
        />
      </div>
    </div>
  );
}
