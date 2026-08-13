'use client';

import { useEffect, useState } from 'react';
import ScoreRing from '@/app/components/ScoreRing';
import ExportButtons from '@/app/components/ExportButtons';

type RelatorioData = {
  totais: { vagas: number; candidatos: number; concluidos: number; scoreMedioGeral: number | null };
  vagas: { id: string; cargo: string; senioridade: string; total: number; concluidos: number; emAndamento: number; scoreMedio: number | null }[];
  distribuicaoNotas: { faixa: string; total: number }[];
  funil: { pendentes: number; aprovados: number; rejeitados: number; total: number };
  timeline: { periodo: string; total: number; concluidos: number }[];
  scorePorSenioridade: { cargo: string; senioridade: string; scoreMedio: number | null; total: number }[];
  topCandidatos: { nome: string; email: string; scoreMedio: number | null; vaga: string; fase: string; talent: string }[];
  talentStats: { nome: string; email: string; total: number; concluidos: number; aprovados: number; scoreMedio: number | null; taxaConversao: number }[];
};

function iniciais(n: string) { return n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'; }
function corScore(s: number | null) { if (s === null) return 'text-fg/40'; if (s >= 7) return 'text-v4green'; if (s >= 4) return 'text-v4yellow'; return 'text-v4red'; }

export default function RelatoriosPage() {
  const [data, setData] = useState<RelatorioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [vagaFiltro, setVagaFiltro] = useState('');
  const [faixaScore, setFaixaScore] = useState('');
  const [periodo, setPeriodo] = useState('mes');
  const [tab, setTab] = useState<'visaoGeral' | 'porVaga' | 'porTalent' | 'tabela'>('visaoGeral');

  async function carregar() {
    const p = new URLSearchParams();
    if (vagaFiltro) p.set('vagaId', vagaFiltro);
    if (faixaScore === 'alto') p.set('scoreMin', '7');
    if (faixaScore === 'medio') { p.set('scoreMin', '4'); p.set('scoreMax', '6.99'); }
    if (faixaScore === 'baixo') p.set('scoreMax', '3.99');
    p.set('periodo', periodo);
    const res = await fetch(`/api/relatorios?${p.toString()}`);
    setData(await res.json());
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [vagaFiltro, faixaScore, periodo]);

  function baixar(formato: 'csv' | 'pdf') {
    const p = new URLSearchParams();
    if (vagaFiltro) p.set('vagaId', vagaFiltro);
    p.set('formato', formato);
    window.location.href = `/api/relatorios?${p.toString()}`;
  }

  if (loading) return <p className="text-fg/50">Carregando…</p>;
  if (!data) return <p className="text-v4red">Erro ao carregar.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Relatórios</h1>
          <p className="text-fg/40 text-sm mt-0.5">Análise profunda com filtros e exportação.</p>
        </div>
        <ExportButtons onExport={baixar} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={vagaFiltro} onChange={(e) => setVagaFiltro(e.target.value)} className="rounded-full bg-v4surface border border-v4border px-3 py-2 text-sm outline-none focus:border-v4red">
          <option value="">Todas as vagas</option>
          {data.vagas.map((v) => <option key={v.id} value={v.id}>{v.cargo}</option>)}
        </select>
        <select value={faixaScore} onChange={(e) => setFaixaScore(e.target.value)} className="rounded-full bg-v4surface border border-v4border px-3 py-2 text-sm outline-none focus:border-v4red">
          <option value="">Todos os scores</option>
          <option value="alto">Alto (≥7)</option>
          <option value="medio">Médio (4–7)</option>
          <option value="baixo">Baixo (&lt;4)</option>
        </select>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="rounded-full bg-v4surface border border-v4border px-3 py-2 text-sm outline-none focus:border-v4red">
          <option value="semana">Por semana</option>
          <option value="mes">Por mês</option>
          <option value="trimestre">Por trimestre</option>
        </select>
      </div>

      {/* Tabs internas */}
      <div className="flex gap-1.5">
        {([['visaoGeral', 'Visão Geral'], ['porVaga', 'Por Vaga'], ['porTalent', 'Por Talent'], ['tabela', 'Tabela Completa']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-3.5 py-1.5 rounded-full text-sm transition ${tab === id ? 'bg-v4red text-fg font-medium' : 'bg-fg/[0.05] text-fg/60 hover:bg-fg/10'}`}>{label}</button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-fg/10 bg-fg/5 p-4"><div className="text-xs text-fg/50">Candidatos</div><div className="text-2xl font-bold">{data.totais.candidatos}</div></div>
        <div className="rounded-xl border border-fg/10 bg-fg/5 p-4"><div className="text-xs text-fg/50">Concluídos</div><div className="text-2xl font-bold">{data.totais.concluidos}</div></div>
        <div className="rounded-xl border border-fg/10 bg-fg/5 p-4"><div className="text-xs text-fg/50">Aprovados</div><div className="text-2xl font-bold text-v4green">{data.funil.aprovados}</div></div>
        <div className="rounded-xl border border-fg/10 bg-fg/5 p-4"><div className="text-xs text-fg/50">Score médio</div><div className={`text-2xl font-bold ${corScore(data.totais.scoreMedioGeral)}`}>{data.totais.scoreMedioGeral?.toFixed(1) ?? '—'}</div></div>
      </div>

      {/* Conteúdo por tab */}
      {tab === 'visaoGeral' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-fg/5 border border-fg/10 rounded-xl p-5">
            <h3 className="font-heading font-semibold text-sm mb-4">Funil de seleção</h3>
            <GraficoFunil funil={data.funil} />
          </div>
          <div className="bg-fg/5 border border-fg/10 rounded-xl p-5">
            <h3 className="font-heading font-semibold text-sm mb-4">Distribuição de notas</h3>
            <GraficoBarras dados={data.distribuicaoNotas} />
          </div>
          <div className="bg-fg/5 border border-fg/10 rounded-xl p-5 lg:col-span-2">
            <h3 className="font-heading font-semibold text-sm mb-4">Evolução temporal</h3>
            <GraficoTimeline dados={data.timeline} />
            <div className="flex items-center gap-4 mt-3 text-[10px] text-fg/40">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-v4red/70" /> Total</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-v4green/70" /> Concluídos</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'porVaga' && (
        <div className="space-y-4">
          <div className="bg-fg/5 border border-fg/10 rounded-xl p-5">
            <h3 className="font-heading font-semibold text-sm mb-4">Score por vaga</h3>
            <GraficoScoreVagas dados={data.scorePorSenioridade} />
          </div>
          <div className="bg-fg/5 border border-fg/10 rounded-xl p-5">
            <h3 className="font-heading font-semibold text-sm mb-4">Detalhamento por vaga</h3>
            <div className="space-y-3">
              {data.vagas.map((v) => (
                <div key={v.id} className="flex items-center gap-3 text-sm p-2 rounded-lg hover:bg-fg/[0.03]">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{v.cargo}</div>
                    <div className="text-xs text-fg/40">{v.senioridade}</div>
                  </div>
                  <div className="text-center px-3">
                    <div className="text-lg font-bold">{v.total}</div>
                    <div className="text-[10px] text-fg/40">candidatos</div>
                  </div>
                  <div className="text-center px-3">
                    <div className="text-lg font-bold text-v4green">{v.concluidos}</div>
                    <div className="text-[10px] text-fg/40">concluídos</div>
                  </div>
                  <div className="w-24">
                    <div className="h-2 rounded-full bg-fg/[0.06] overflow-hidden">
                      <div className="h-full rounded-full bg-v4red" style={{ width: `${v.total ? (v.concluidos / v.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <span className={`text-sm font-bold w-10 text-right ${corScore(v.scoreMedio)}`}>{v.scoreMedio?.toFixed(1) ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'porTalent' && (
        <div className="bg-fg/5 border border-fg/10 rounded-xl p-5">
          <h3 className="font-heading font-semibold text-sm mb-4">Performance por Talent</h3>
          {data.talentStats.length === 0 ? (
            <p className="text-fg/40 text-sm">Nenhum talent com candidatos atribuídos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-fg/40 border-b border-fg/10">
                    <th className="text-left py-2 px-2">Talent</th>
                    <th className="text-center py-2 px-2">Candidatos</th>
                    <th className="text-center py-2 px-2">Concluídos</th>
                    <th className="text-center py-2 px-2">Aprovados</th>
                    <th className="text-center py-2 px-2">Score médio</th>
                    <th className="text-center py-2 px-2">Conversão</th>
                  </tr>
                </thead>
                <tbody>
                  {data.talentStats.map((t) => (
                    <tr key={t.email} className="border-b border-fg/5 hover:bg-fg/[0.03]">
                      <td className="py-2.5 px-2"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-v4red/15 text-v4red flex items-center justify-center text-[10px] font-bold">{iniciais(t.nome)}</div><span className="font-medium">{t.nome}</span></div></td>
                      <td className="text-center py-2.5 px-2 font-semibold">{t.total}</td>
                      <td className="text-center py-2.5 px-2">{t.concluidos}</td>
                      <td className="text-center py-2.5 px-2 text-v4green font-semibold">{t.aprovados}</td>
                      <td className="text-center py-2.5 px-2"><span className={corScore(t.scoreMedio)}>{t.scoreMedio?.toFixed(1) ?? '—'}</span></td>
                      <td className="text-center py-2.5 px-2">
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-16 h-1.5 rounded-full bg-fg/[0.06] overflow-hidden"><div className="h-full rounded-full bg-v4green" style={{ width: `${t.taxaConversao}%` }} /></div>
                          <span className="text-xs text-fg/50">{t.taxaConversao}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'tabela' && (
        <div className="bg-fg/5 border border-fg/10 rounded-xl p-5">
          <h3 className="font-heading font-semibold text-sm mb-4">Tabela completa de candidatos</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-fg/40 border-b border-fg/10">
                  <th className="text-left py-2 px-2">Nome</th>
                  <th className="text-left py-2 px-2">Vaga</th>
                  <th className="text-center py-2 px-2">Status</th>
                  <th className="text-center py-2 px-2">Score</th>
                  <th className="text-left py-2 px-2">Talent</th>
                </tr>
              </thead>
              <tbody>
                {data.topCandidatos.map((c, i) => (
                  <tr key={i} className="border-b border-fg/5 hover:bg-fg/[0.03]">
                    <td className="py-2 px-2"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-v4red/15 text-v4red flex items-center justify-center text-[9px] font-bold shrink-0">{iniciais(c.nome)}</div><span className="font-medium truncate">{c.nome}</span></div></td>
                    <td className="py-2 px-2 text-fg/60 truncate">{c.vaga}</td>
                    <td className="py-2 px-2 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${c.fase === 'Aprovado' ? 'bg-v4green/15 text-v4green' : c.fase === 'Reprovado' ? 'bg-v4red/15 text-v4red' : 'bg-fg/5 text-fg/50'}`}>{c.fase}</span></td>
                    <td className="py-2 px-2 text-center"><span className={`font-semibold ${corScore(c.scoreMedio)}`}>{c.scoreMedio?.toFixed(1) ?? '—'}</span></td>
                    <td className="py-2 px-2 text-fg/50 text-xs">{c.talent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function GraficoFunil({ funil }: { funil: { pendentes: number; aprovados: number; rejeitados: number; total: number } }) {
  const total = Math.max(1, funil.total);
  return (
    <div className="space-y-3">
      {[{ label: 'Pendentes', valor: funil.pendentes, cor: '#FFC02A' }, { label: 'Aprovados', valor: funil.aprovados, cor: '#52CC5A' }, { label: 'Rejeitados', valor: funil.rejeitados, cor: '#E50914' }].map((l) => {
        const pct = Math.round((l.valor / total) * 100);
        return (
          <div key={l.label}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="flex items-center gap-2 text-fg/70"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.cor }} />{l.label}</span>
              <span className="text-fg/90 font-semibold">{pct}% <span className="text-fg/40 font-normal">· {l.valor}</span></span>
            </div>
            <div className="h-2 rounded-full bg-fg/[0.06] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: l.cor }} /></div>
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
    <div className="flex items-end justify-between gap-3 h-36 px-1">
      {dados.map((d, i) => (
        <div key={d.faixa} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
          {d.total > 0 && <span className="text-xs font-semibold text-fg/80">{d.total}</span>}
          <div className="w-full rounded-t-lg" style={{ height: `${Math.max(4, (d.total / max) * 100)}%`, backgroundColor: cores[i], opacity: d.total === 0 ? 0.15 : 0.9 }} />
          <span className="text-[10px] text-fg/40">{d.faixa}</span>
        </div>
      ))}
    </div>
  );
}

function GraficoTimeline({ dados }: { dados: { periodo: string; total: number; concluidos: number }[] }) {
  if (dados.length === 0) return <p className="text-fg/40 text-sm">Sem dados.</p>;
  const max = Math.max(1, ...dados.map((d) => d.total));
  return (
    <div className="h-36 flex items-end gap-1">
      {dados.map((d) => (
        <div key={d.periodo} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-field/90 text-[10px] text-fg px-2 py-1 rounded whitespace-nowrap z-10">{d.periodo}: {d.total} total, {d.concluidos} concluídos</div>
          {d.total > 0 && <span className="text-[10px] text-fg/60">{d.total}</span>}
          <div className="w-full flex gap-0.5 items-end">
            <div className="flex-1 rounded-t bg-v4red/70" style={{ height: `${Math.max(2, (d.total / max) * 100)}%` }} />
            <div className="flex-1 rounded-t bg-v4green/70" style={{ height: `${Math.max(2, (d.concluidos / max) * 100)}%` }} />
          </div>
          <span className="text-[9px] text-fg/30 truncate w-full text-center">{d.periodo}</span>
        </div>
      ))}
    </div>
  );
}

function GraficoScoreVagas({ dados }: { dados: { cargo: string; senioridade: string; scoreMedio: number | null; total: number }[] }) {
  if (dados.length === 0) return <p className="text-fg/40 text-sm">Sem dados.</p>;
  return (
    <div className="space-y-3">
      {dados.map((d, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          <div className="flex-1 min-w-0"><div className="font-medium truncate">{d.cargo}</div><div className="text-xs text-fg/40">{d.senioridade} · {d.total} avaliados</div></div>
          <div className="w-24 h-2 rounded-full bg-fg/[0.06] overflow-hidden shrink-0"><div className="h-full rounded-full" style={{ width: `${((d.scoreMedio ?? 0) / 10) * 100}%`, backgroundColor: (d.scoreMedio ?? 0) >= 7 ? '#52CC5A' : (d.scoreMedio ?? 0) >= 4 ? '#FFC02A' : '#E50914' }} /></div>
          <span className={`text-xs font-bold w-8 text-right ${corScore(d.scoreMedio)}`}>{d.scoreMedio?.toFixed(1) ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}
