'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/app/components/Toast';
import ScoreRing from '@/app/components/ScoreRing';
import GraficoBarras from '@/app/components/GraficoBarras';
import GraficoFunil from '@/app/components/GraficoFunil';
import { useSessao } from '@/app/components/Sessao';
import NovaVagaWizard from '@/app/components/NovaVagaWizard';
import ExportButtons from '@/app/components/ExportButtons';

type VagaStats = {
  id: string;
  cargo: string;
  senioridade: string;
  segmento: string;
  createdAt: string;
  ativa: boolean;
  totalCandidatos: number;
  concluidos: number;
  emAndamento: number;
  scoreMedio: number | null;
  topCandidato: { nome: string; scoreMedio: number | null } | null;
};

type DashboardData = {
  totais: {
    vagas: number;
    candidatos: number;
    concluidos: number;
    scoreMedioGeral: number | null;
  };
  vagas: VagaStats[];
  distribuicaoNotas: { faixa: string; total: number }[];
  funil: { pendentes: number; aprovados: number; rejeitados: number; total: number };
};

function corScore(score: number | null) {
  if (score === null) return 'text-fg/40';
  if (score >= 7) return 'text-v4green';
  if (score >= 4) return 'text-v4yellow';
  return 'text-v4red';
}

export default function DashboardPage() {
  const { mostrar, ToastContainer } = useToast();
  const { usuario } = useSessao();
  const isAdmin = usuario?.role === 'admin';
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [filtroAtiva, setFiltroAtiva] = useState<'ativas' | 'inativas' | 'todas'>('ativas');
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [aplicandoLote, setAplicandoLote] = useState(false);

  async function carregar() {
    const res = await fetch('/api/dashboard');
    setData(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    const interval = setInterval(carregar, 8000);
    return () => clearInterval(interval);
  }, []);

  async function criarVagaHandler(data: any) {
    setGerando(true);
    try {
      const res = await fetch('/api/vagas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Erro ao criar vaga');
      window.location.href = `/vagas/${result.id}`;
    } catch (err: any) {
      mostrar(err.message ?? 'Erro ao criar vaga', 'erro');
      setGerando(false);
    }
  }

  function toggleSelecao(id: string) {
    setSelecionadas((atual) => {
      const next = new Set(atual);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function aplicarAtivaEmLote(ativa: boolean) {
    setAplicandoLote(true);
    try {
      const resultados = await Promise.all(
        Array.from(selecionadas).map((id) =>
          fetch(`/api/vagas/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ativa })
          })
        )
      );
      const falhas = resultados.filter((r) => !r.ok).length;
      setSelecionadas(new Set());
      setModoSelecao(false);
      await carregar();
      if (falhas > 0) mostrar(`${falhas} vaga(s) não puderam ser atualizadas.`, 'erro');
      else mostrar(ativa ? 'Vaga(s) reativada(s).' : 'Vaga(s) inativada(s).', 'sucesso');
    } finally {
      setAplicandoLote(false);
    }
  }

  if (loading || !data) return <p className="text-fg/50">Carregando dashboard…</p>;

  const { totais } = data;
  const vagasFiltradas = data.vagas.filter((v) => {
    if (filtroAtiva === 'ativas') return v.ativa;
    if (filtroAtiva === 'inativas') return !v.ativa;
    return true;
  });

  return (
    <div className="space-y-8">
      {ToastContainer}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Vagas</h1>
          <p className="text-fg/40 text-sm mt-0.5">Visão geral do seu funil de seleção</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons onExport={(formato) => { window.location.href = `/api/dashboard?formato=${formato}`; }} />
          {isAdmin && (
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="rounded-full bg-v4red hover:bg-v4redDark text-fg font-semibold px-5 py-2.5 text-sm transition shadow-card"
          >
            {mostrarForm ? 'Cancelar' : '+ Nova vaga'}
          </button>
          )}
        </div>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Vagas ativas" value={totais.vagas} icone="💼" />
        <StatCard label="Candidatos" value={totais.candidatos} icone="👥" />
        <StatCard label="Entrevistas concluídas" value={totais.concluidos} icone="🎬" />
        <StatCard
          label="Score médio geral"
          value={totais.scoreMedioGeral !== null ? totais.scoreMedioGeral.toFixed(1) : '—'}
          destaque={corScore(totais.scoreMedioGeral)}
          icone="⭐"
        />
      </section>

      <section className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-v4border bg-v4surface p-5 shadow-card">
          <h2 className="font-heading font-semibold mb-1">Funil de seleção</h2>
          <p className="text-fg/40 text-xs mb-4">Onde os candidatos avançam — e onde param</p>
          <GraficoFunil funil={data.funil} />
        </div>
        <div className="rounded-2xl border border-v4border bg-v4surface p-5 shadow-card">
          <h2 className="font-heading font-semibold mb-1">Distribuição de notas</h2>
          <p className="text-fg/40 text-xs mb-4">
            Qualidade dos candidatos · {totais.concluidos} entrevista(s) pontuada(s)
          </p>
          <GraficoBarras dados={data.distribuicaoNotas} />
        </div>
      </section>

      {mostrarForm && (
        <NovaVagaWizard onCriar={criarVagaHandler} />
      )}

      <section>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="font-heading text-lg font-semibold">Vagas</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-full bg-v4surface p-1 text-sm">
              {(['ativas', 'inativas', 'todas'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltroAtiva(f)}
                  className={`px-3 py-1.5 rounded-full transition ${
                    filtroAtiva === f ? 'bg-v4red text-fg' : 'text-fg/50 hover:text-fg/80'
                  }`}
                >
                  {f === 'ativas' ? 'Ativas' : f === 'inativas' ? 'Inativas' : 'Todas'}
                </button>
              ))}
            </div>
            {isAdmin && (
              <button
                onClick={() => { setModoSelecao((v) => !v); if (modoSelecao) setSelecionadas(new Set()); }}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  modoSelecao ? 'bg-v4red text-fg' : 'bg-fg/[0.05] text-fg/60 hover:bg-fg/10'
                }`}
              >
                {modoSelecao ? '✕ Cancelar' : '☑ Selecionar'}
              </button>
            )}
          </div>
        </div>

        {modoSelecao && selecionadas.size > 0 && (
          <div className="flex items-center gap-3 mb-4 rounded-xl bg-v4surface border border-v4border px-4 py-2.5">
            <span className="text-xs text-fg/50">{selecionadas.size} selecionada(s)</span>
            <button
              disabled={aplicandoLote}
              onClick={() => aplicarAtivaEmLote(false)}
              className="rounded-full bg-v4yellow/15 text-v4yellow hover:bg-v4yellow/25 px-3 py-1.5 text-xs font-medium transition disabled:opacity-50"
            >
              🚫 Inativar selecionadas
            </button>
            <button
              disabled={aplicandoLote}
              onClick={() => aplicarAtivaEmLote(true)}
              className="rounded-full bg-v4green/15 text-v4green hover:bg-v4green/25 px-3 py-1.5 text-xs font-medium transition disabled:opacity-50"
            >
              ♻ Reativar selecionadas
            </button>
          </div>
        )}

        {vagasFiltradas.length === 0 ? (
          <p className="text-fg/50">
            {filtroAtiva === 'ativas'
              ? 'Nenhuma vaga ativa. Clique em "+ Nova vaga" ou veja as inativas.'
              : 'Nenhuma vaga nessa categoria.'}
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {vagasFiltradas.map((v) => {
              const selecionada = selecionadas.has(v.id);
              const conteudo = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate flex items-center gap-2">
                        {v.cargo} <span className="text-fg/40 font-normal">· {v.senioridade}</span>
                        {!v.ativa && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-fg/10 text-fg/50 uppercase tracking-wide">
                            Inativa
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-fg/45 truncate">{v.segmento}</div>
                    </div>
                    {modoSelecao ? (
                      <input
                        type="checkbox"
                        checked={selecionada}
                        onChange={() => toggleSelecao(v.id)}
                        className="w-5 h-5 rounded accent-v4red shrink-0"
                      />
                    ) : (
                      <ScoreRing score={v.scoreMedio} size={48} />
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-4 flex-wrap">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-fg/[0.06] text-fg/60">
                      {v.totalCandidatos} candidato(s)
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-v4green/10 text-v4green">
                      {v.concluidos} concluído(s)
                    </span>
                    {v.emAndamento > 0 && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-v4yellow/10 text-v4yellow">
                        {v.emAndamento} em andamento
                      </span>
                    )}
                  </div>

                  {v.topCandidato && (
                    <div className="mt-3 pt-3 border-t border-fg/[0.06] text-sm text-fg/70">
                      🏆 Top candidato: <span className="font-medium">{v.topCandidato.nome}</span>{' '}
                      <span className={corScore(v.topCandidato.scoreMedio)}>
                        ({v.topCandidato.scoreMedio?.toFixed(1)})
                      </span>
                    </div>
                  )}
                </>
              );

              const classeBase = `rounded-2xl border p-5 transition shadow-card ${
                selecionada ? 'border-v4red ring-1 ring-v4red/30' : 'border-v4border'
              } ${!v.ativa ? 'opacity-60' : ''}`;

              return modoSelecao ? (
                <div
                  key={v.id}
                  onClick={() => toggleSelecao(v.id)}
                  className={`${classeBase} bg-v4surface cursor-pointer hover:border-fg/20`}
                >
                  {conteudo}
                </div>
              ) : (
                <a
                  key={v.id}
                  href={`/vagas/${v.id}`}
                  className={`${classeBase} bg-v4surface hover:bg-fg/[0.06] hover:border-fg/20 block`}
                >
                  {conteudo}
                </a>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  destaque,
  icone
}: {
  label: string;
  value: string | number;
  destaque?: string;
  icone: string;
}) {
  return (
    <div className="rounded-2xl border border-v4border bg-v4surface p-4 shadow-card">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-fg/50 uppercase tracking-wide">{label}</div>
        <span className="w-7 h-7 rounded-full bg-fg/[0.06] flex items-center justify-center text-sm">
          {icone}
        </span>
      </div>
      <div className={`text-2xl font-bold ${destaque ?? ''}`}>{value}</div>
    </div>
  );
}
