'use client';

import { useEffect, useState } from 'react';
import ScoreRing from '@/app/components/ScoreRing';

type DashboardData = {
  totais: { vagas: number; candidatos: number; concluidos: number; emAndamento: number; aprovados: number; rejeitados: number; scoreMedioGeral: number | null; semTalent: number };
  funil: { pendentes: number; aprovados: number; rejeitados: number; total: number };
  distribuicaoNotas: { faixa: string; total: number }[];
  porTalent: { nome: string; email: string; total: number; concluidos: number; aprovados: number; scoreMedio: number | null; taxaConversao: number }[];
  topCandidatos: { nome: string; scoreMedio: number | null; vaga: string; talent: string }[];
  vagas: { id: string; cargo: string; senioridade: string; total: number; concluidos: number; emAndamento: number; scoreMedio: number | null }[];
  ultimasAtividades: { nome: string; vaga: string; status: string; scoreMedio: number | null; talent: string; criadoEm: string }[];
  precisaAtencao: { id: string; nome: string; score?: number | null; vaga?: string; motivo: string }[];
};

function iniciais(n: string) { return n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'; }
function corScore(s: number | null) { if (s === null) return 'text-white/40'; if (s >= 7) return 'text-v4green'; if (s >= 4) return 'text-v4yellow'; return 'text-v4red'; }

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    const res = await fetch('/api/dashboard');
    setData(await res.json());
    setLoading(false);
  }

  useEffect(() => { carregar(); const i = setInterval(carregar, 8000); return () => clearInterval(i); }, []);

  if (loading) return <p className="text-white/50">Carregando…</p>;
  if (!data) return <p className="text-v4red">Erro ao carregar.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Dashboard</h1>
        <p className="text-white/40 text-sm mt-0.5">Visão real-time do pipeline. Atualiza a cada 8s.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Kpi label="Vagas" value={data.totais.vagas} icone="📋" />
        <Kpi label="Candidatos" value={data.totais.candidatos} icone="👥" />
        <Kpi label="Concluídos" value={data.totais.concluidos} icone="✅" />
        <Kpi label="Em andamento" value={data.totais.emAndamento} icone="⏳" cor="text-v4yellow" />
        <Kpi label="Aprovados" value={data.totais.aprovados} icone="🎯" cor="text-v4green" />
        <Kpi label="Rejeitados" value={data.totais.rejeitados} icone="❌" cor="text-v4red" />
        <Kpi label="Score médio" value={data.totais.scoreMedioGeral?.toFixed(1) ?? '—'} icone="⭐" cor={corScore(data.totais.scoreMedioGeral)} />
      </div>

      {/* Precisa de atenção */}
      {data.precisaAtencao.length > 0 && (
        <div className="bg-v4yellow/5 border border-v4yellow/20 rounded-xl p-5">
          <h3 className="font-heading font-semibold text-sm mb-3 flex items-center gap-2">
            <span className="text-v4yellow">⚠️</span> Precisa de atenção
            <span className="text-xs bg-v4yellow/20 text-v4yellow px-2 py-0.5 rounded-full">{data.precisaAtencao.length}</span>
          </h3>
          <div className="space-y-2">
            {data.precisaAtencao.map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm p-2 rounded-lg bg-black/20 hover:bg-black/30 transition">
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{item.nome}</span>
                  {item.vaga && <span className="text-white/40"> · {item.vaga}</span>}
                </div>
                {item.score != null && <span className={`font-semibold text-xs ${corScore(item.score)}`}>{item.score.toFixed(1)}</span>}
                <span className="text-xs text-v4yellow/80 shrink-0">{item.motivo}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Talent Performance */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-semibold">Performance por Talent</h3>
          {data.totais.semTalent > 0 && (
            <span className="text-xs bg-v4yellow/15 text-v4yellow px-2 py-1 rounded-full">
              {data.totais.semTalent} sem talent atribuído
            </span>
          )}
        </div>
        {data.porTalent.length === 0 ? (
          <p className="text-white/40 text-sm">Nenhum talent com candidatos atribuídos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-white/40 border-b border-white/10">
                  <th className="text-left py-2 px-2">Talent</th>
                  <th className="text-center py-2 px-2">Candidatos</th>
                  <th className="text-center py-2 px-2">Concluídos</th>
                  <th className="text-center py-2 px-2">Aprovados</th>
                  <th className="text-center py-2 px-2">Score médio</th>
                  <th className="text-center py-2 px-2">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {data.porTalent.map((t) => (
                  <tr key={t.email} className="border-b border-white/5 hover:bg-white/[0.03]">
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-v4red/15 text-v4red flex items-center justify-center text-[10px] font-bold">{iniciais(t.nome)}</div>
                        <span className="font-medium">{t.nome}</span>
                      </div>
                    </td>
                    <td className="text-center py-2.5 px-2 font-semibold">{t.total}</td>
                    <td className="text-center py-2.5 px-2">{t.concluidos}</td>
                    <td className="text-center py-2.5 px-2 text-v4green font-semibold">{t.aprovados}</td>
                    <td className="text-center py-2.5 px-2"><span className={corScore(t.scoreMedio)}>{t.scoreMedio?.toFixed(1) ?? '—'}</span></td>
                    <td className="text-center py-2.5 px-2">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-16 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full bg-v4green" style={{ width: `${t.taxaConversao}%` }} />
                        </div>
                        <span className="text-xs text-white/50">{t.taxaConversao}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Linha: Funil + Atividade recente */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="font-heading font-semibold text-sm mb-4">Funil de seleção</h3>
          <GraficoFunil funil={data.funil} />
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="font-heading font-semibold text-sm mb-4">Atividade recente</h3>
          <div className="space-y-2">
            {data.ultimasAtividades.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="w-6 h-6 rounded-full bg-v4red/15 text-v4red flex items-center justify-center text-[9px] font-bold shrink-0">{iniciais(a.nome)}</div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{a.nome}</span>
                  <span className="text-white/40"> em </span>
                  <span className="text-white/60">{a.vaga}</span>
                </div>
                <span className={`font-semibold ${corScore(a.scoreMedio)}`}>{a.scoreMedio?.toFixed(1) ?? '—'}</span>
                <span className="text-white/30">{new Date(a.criadoEm).toLocaleDateString('pt-BR')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Linha: Score + Top candidatos */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="font-heading font-semibold text-sm mb-4">Distribuição de notas</h3>
          <GraficoBarras dados={data.distribuicaoNotas} />
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="font-heading font-semibold text-sm mb-4">Top 10 candidatos</h3>
          <div className="space-y-2">
            {data.topCandidatos.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-xs text-white/30 w-4 text-right">{i + 1}º</span>
                <div className="w-6 h-6 rounded-full bg-v4red/15 text-v4red flex items-center justify-center text-[9px] font-bold shrink-0">{iniciais(c.nome)}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-xs">{c.nome}</div>
                  <div className="text-[10px] text-white/40 truncate">{c.vaga}</div>
                </div>
                <ScoreRing score={c.scoreMedio} size={28} strokeWidth={2} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icone, cor }: { label: string; value: string | number; icone: string; cor?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
      <div className="text-lg mb-0.5">{icone}</div>
      <div className={`text-xl font-bold ${cor ?? ''}`}>{value}</div>
      <div className="text-[10px] text-white/40 mt-0.5">{label}</div>
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
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.cor }} />{l.label}
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
    <div className="flex items-end justify-between gap-3 h-36 px-1">
      {dados.map((d, i) => (
        <div key={d.faixa} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
          {d.total > 0 && <span className="text-xs font-semibold text-white/80">{d.total}</span>}
          <div className="w-full rounded-t-lg" style={{ height: `${Math.max(4, (d.total / max) * 100)}%`, backgroundColor: cores[i], opacity: d.total === 0 ? 0.15 : 0.9 }} />
          <span className="text-[10px] text-white/40">{d.faixa}</span>
        </div>
      ))}
    </div>
  );
}
