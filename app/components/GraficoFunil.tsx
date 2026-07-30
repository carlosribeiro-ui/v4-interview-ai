/** Funil de seleção — barras horizontais proporcionais, no estilo Coploy. */
export default function GraficoFunil({
  funil
}: {
  funil: { pendentes: number; aprovados: number; rejeitados: number; total: number };
}) {
  const linhas: { label: string; valor: number; cor: string }[] = [
    { label: 'Pendentes', valor: funil.pendentes, cor: '#FFC02A' },
    { label: 'Aprovados', valor: funil.aprovados, cor: '#52CC5A' },
    { label: 'Rejeitados', valor: funil.rejeitados, cor: '#E50914' }
  ];
  const total = Math.max(1, funil.total);

  return (
    <div className="space-y-3.5">
      {linhas.map((l) => {
        const pct = Math.round((l.valor / total) * 100);
        return (
          <div key={l.label}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="flex items-center gap-2 text-white/70">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.cor }} />
                {l.label}
              </span>
              <span className="text-white/90 font-semibold">
                {pct}% <span className="text-white/40 font-normal">· {l.valor}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: l.cor }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
