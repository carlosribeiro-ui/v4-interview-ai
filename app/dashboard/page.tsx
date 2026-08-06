'use client';

import { useEffect, useState } from 'react';
import ScoreRing from '@/app/components/ScoreRing';

type DashboardData = {
  totais: {
    vagas: number;
    candidatos: number;
    concluidos: number;
    emAndamento: number;
    aprovados: number;
    rejeitados: number;
    scoreMedioGeral: number | null;
  };
  vagas: { id: string; cargo: string; senioridade: string; total: number; concluidos: number; emAndamento: number; scoreMedio: number | null }[];
  distribuicaoNotas: { faixa: string; total: number }[];
  funil: { pendentes: number; aprovados: number; rejeitados: number; total: number };
  taxaConversao: { emAndamento: number; concluidos: number; aprovados: number; rejeitados: number };
  timeline: { periodo: string; total: number; concluidos: number }[];
  scorePorSenioridade: { cargo: string; senioridade: string; scoreMedio: number | null; total: number }[];
  topCandidatos: { nome: string; email: string; scoreMedio: number | null; vaga: string; fase: string }[];
};

function iniciais(nome: string) {
  return nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function corScore(s: number | null) {
  if (s === null) return 'text-white/40';
  if (s >= 7) return 'text-v4green';
  if (s >= 4) return 'text-v4yellow';
  return 'text-v4red';
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [vagaFiltro, setVagaFiltro] = useState('');
  const [faixaScore, setFaixaScore] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [periodo, setPeriodo] = useState('mes');

  async function carregar() {
    const p = new URLSearchParams();
    if (vagaFiltro) p.set('vagaId', vagaFiltro);
    if (faixaScore === 'alto') p.set('scoreMin', '7');
    if (faixaScore === 'medio') { p.set('scoreMin', '4'); p.set('scoreMax', '6.99'); }
    if (faixaScore === 'baixo') p.set('scoreMax', '3.99');
    if (statusFiltro) p.set('status', statusFiltro);
    p.set('periodo', periodo);

    const res = await fetch(`/api/dashboard?${p.toString()}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [vagaFiltro, faixaScore, statusFiltro, periodo]);

  function baixarCsv() {
    const p = new URLSearchParams();
    if (vagaFiltro) p.set('vagaId', vagaFiltro);
    p.set('formato', 'csv');
    window.location.href = `/api/dashboard?${p.toString()}`;
  }

  if (loading) return <p className="text-white/50">Carregando…</p>;
  if (!data) return <p className="text-v4red">Erro ao carregar dashboard.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Dashboard</h1>
          <p className="text-white/40 text-sm mt-0.5">Métricas completas do pipeline de seleção.</p>
        </div>
        <button onClick={baixarCsv} className="rounded-full bg-v4green/15 text-v4green hover:bg-v4green/25 font-semibold px-4 py-2 text-sm transition">
          ⬇ Baixar CSV
        </button>
      </div>

      {/* Filtros multi-camada */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={vagaFiltro} onChange={(e) => setVagaFiltro(e.target.value)}
          className="rounded-full bg-v4surface border border-v4border px-3 py-2 text-sm outline-none focus:border-v4red">
          <option value="">Todas as vagas</option>
          {data.vagas.map((v) => <option key={v.id} value={v.id}>{v.cargo}</option>)}
        </select>
        <select value={faixaScore} onChange={(e) => setFaixaScore(e.target.value)}
          className="rounded-full bg-v4surface border border-v4border px-3 py-2 text-sm outline-none focus:border-v4red">
          <option value="">Todos os scores</option>
          <option value="alto">Alto (≥7)</option>
          <option value="medio">Médio (4–7)</option>
          <option value="baixo">Baixo (&lt;4)</option>
        </select>
        <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}
          className="rounded-full bg-v4surface border border-v4border px-3 py-2 text-sm outline-none focus:border-v4red">
          <option value="">Todos os status</option>
          <option value="em_andamento">Em andamento</option>
          <option value="concluida">Concluídos</option>
        </select>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}
          className="rounded-full bg-v4surface border border-v4border px-3 py-2 text-sm outline-none focus:border-v4red">
          <option value="semana">Por semana</option>
          <option value="mes">Por mês</option>
          <option value="trimestre">Por trimestre</option>
        </select>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Vagas" value={data.totais.vagas} />
        <StatCard label="Candidatos" value={data.totais.candidatos} />
        <StatCard label="Concluídos" value={data.totais.concluidos} />
        <StatCard label="Em andamento" value={data.totais.emAndamento} destaque="text-v4yellow" />
        <StatCard label="Aprovados" value={data.totais.aprovados} destaque="text-v4green" />
        <StatCard label="Score médio" value={data.totais.scoreMedioGeral?.toFixed(1) ?? '—'} destaque={corScore(data.totais.scoreMedioGeral)} />
      </div>

      {/* Linha 1: Funil + Distribuição de notas */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="font-heading font-semibold text-sm mb-4">Funil de seleção</h3>
          <GraficoFunil funil={data.funil} />
          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/10">
            <ConversionPct label="Em andamento" pct={data.taxaConversao.emAndamento} cor="text-v4yellow" />
            <ConversionPct label="Aprovados" pct={data.taxaConversao.aprovados} cor="text-v4green" />
            <ConversionPct label="Rejeitados" pct={data.taxaConversao.rejeitados} cor="text-v4red" />
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="font-heading font-semibold text-sm mb-4">Distribuição de notas</h3>
          <GraficoBarras dados={data.distribuicaoNotas} />
        </div>
      </div>

      {/* Linha 2: Timeline + Score por vaga */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="font-heading font-semibold text-sm mb-4">Evolução temporal</h3>
          <GraficoTimeline dados={data.timeline} />
          <div className="flex items-center gap-4 mt-3 text-[10px] text-white/40">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-v4red/70" /> Total</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-v4green/70" /> Concluídos</span>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="font-heading font-semibold text-sm mb-4">Score por vaga</h3>
          <GraficoScoreVagas dados={data.scorePorSenioridade} />
        </div>
      </div>

      {/* Linha 3: Vagas detalhadas + Top candidatos */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="font-heading font-semibold text-sm mb-4">Vagas — detalhamento</h3>
          <div className="space-y-3">
            {data.vagas.map((v) => (
              <div key={v.id} className="flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{v.cargo}</div>
                  <div className="text-xs text-white/40">{v.senioridade} · {v.total} candidato(s)</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-20 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-v4red" style={{ width: `${v.total ? (v.concluidos / v.total) * 100 : 0}%` }} />
                  </div>
                  <span className="text-xs text-white/50 w-8 text-right">{v.concluidos}/{v.total}</span>
                  <span className={`text-xs font-semibold w-8 text-right ${corScore(v.scoreMedio)}`}>
                    {v.scoreMedio?.toFixed(1) ?? '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="font-heading font-semibold text-sm mb-4">Top 10 candidatos</h3>
          {data.topCandidatos.length === 0 ? (
            <p className="text-white/40 text-sm">Nenhum candidato concluído ainda.</p>
          ) : (
            <div className="space-y-2">
              {data.topCandidatos.map((c, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="text-xs text-white/30 w-5 text-right">{i + 1}º</span>
                  <div className="w-7 h-7 shrink-0 rounded-full bg-v4red/15 text-v4red flex items-center justify-center text-[10px] font-bold">
                    {iniciais(c.nome)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c.nome}</div>
                    <div className="text-xs text-white/40 truncate">{c.vaga} · {c.fase}</div>
                  </div>
                  <ScoreRing score={c.scoreMedio} size={32} strokeWidth={2.5} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, destaque }: { label: string; value: string | number; destaque?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-white/50 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${destaque ?? ''}`}>{value}</div>
    </div>
  );
}

function ConversionPct({ label, pct, cor }: { label: string; pct: number; cor: string }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${cor}`}>{pct}%</div>
      <div className="text-[10px] text-white/40">{label}</div>
    </div>
  );
}

function GraficoFunil({ funil }: { funil: { pendentes: number; aprovados: number; rejeitados: number; total: number } }) {
  const total = Math.max(1, funil.total);
  const linhas = [
    { label: 'Pendentes', valor: funil.pendentes, cor: '#FFC02A' },
    { label: 'Aprovados', valor: funil.aprovados, cor: '#52CC5A' },
    { label: 'Rejeitados', valor: funil.rejeitados, cor: '#E50914' }
  ];
  return (
    <div className="space-y-3">
      {linhas.map((l) => {
        const pct = Math.round((l.valor / total) * 100);
        return (
          <div key={l.label}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="flex items-center gap-2 text-white/70">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.cor }} />
                {l.label}
              </span>
              <span className="text-white/90 font-semibold">{pct}% <span className="text-white/40 font-normal">· {l.valor}</span></span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: l.cor }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GraficoBarras({ dados }: { dados: { faixa: string; total: number }[] }) {
  const max = Math.max(1, ...dados.map((d) => d.total));
  const cores = ['#E50914', '#FFC02A', '#FFC02A', '#52CC5A', '#52CC5A'];
  return (
    <div className="flex items-end justify-between gap-3 h-40 px-1">
      {dados.map((d, i) => (
        <div key={d.faixa} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
          {d.total > 0 && <span className="text-xs font-semibold text-white/80">{d.total}</span>}
          <div className="w-full rounded-t-lg transition-all" style={{ height: `${Math.max(4, (d.total / max) * 100)}%`, backgroundColor: cores[i], opacity: d.total === 0 ? 0.15 : 0.9 }} />
          <span className="text-[10px] text-white/40">{d.faixa}</span>
        </div>
      ))}
    </div>
  );
}

function GraficoTimeline({ dados }: { dados: { periodo: string; total: number; concluidos: number }[] }) {
  if (dados.length === 0) return <p className="text-white/40 text-sm">Sem dados no período.</p>;
  const max = Math.max(1, ...dados.map((d) => d.total));
  return (
    <div className="h-40 flex items-end gap-1">
      {dados.map((d) => (
        <div key={d.periodo} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black/90 text-[10px] text-white px-2 py-1 rounded whitespace-nowrap z-10">
            {d.periodo}: {d.total} total, {d.concluidos} concluídos
          </div>
          {d.total > 0 && <span className="text-[10px] text-white/60">{d.total}</span>}
          <div className="w-full flex gap-0.5 items-end">
            <div className="flex-1 rounded-t bg-v4red/70" style={{ height: `${Math.max(2, (d.total / max) * 100)}%` }} />
            <div className="flex-1 rounded-t bg-v4green/70" style={{ height: `${Math.max(2, (d.concluidos / max) * 100)}%` }} />
          </div>
          <span className="text-[9px] text-white/30 truncate w-full text-center">{d.periodo}</span>
        </div>
      ))}
    </div>
  );
}

function GraficoScoreVagas({ dados }: { dados: { cargo: string; senioridade: string; scoreMedio: number | null; total: number }[] }) {
  if (dados.length === 0) return <p className="text-white/40 text-sm">Sem dados de score.</p>;
  return (
    <div className="space-y-3">
      {dados.map((d, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{d.cargo}</div>
            <div className="text-xs text-white/40">{d.senioridade} · {d.total} avaliados</div>
          </div>
          <div className="w-24 h-2 rounded-full bg-white/[0.06] overflow-hidden shrink-0">
            <div className="h-full rounded-full transition-all" style={{ width: `${((d.scoreMedio ?? 0) / 10) * 100}%`, backgroundColor: (d.scoreMedio ?? 0) >= 7 ? '#52CC5A' : (d.scoreMedio ?? 0) >= 4 ? '#FFC02A' : '#E50914' }} />
          </div>
          <span className={`text-xs font-bold w-8 text-right ${corScore(d.scoreMedio)}`}>
            {d.scoreMedio?.toFixed(1) ?? '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
