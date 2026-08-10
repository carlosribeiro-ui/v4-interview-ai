'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/app/components/Toast';
import ScoreRing from '@/app/components/ScoreRing';
import GraficoBarras from '@/app/components/GraficoBarras';
import GraficoFunil from '@/app/components/GraficoFunil';
import { useSessao } from '@/app/components/Sessao';
import NovaVagaWizard from '@/app/components/NovaVagaWizard';

type VagaStats = {
  id: string;
  cargo: string;
  senioridade: string;
  segmento: string;
  createdAt: string;
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
  if (score === null) return 'text-white/40';
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

  if (loading || !data) return <p className="text-white/50">Carregando dashboard…</p>;

  const { totais, vagas } = data;

  return (
    <div className="space-y-8">
      {ToastContainer}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Dashboard</h1>
          <p className="text-white/40 text-sm mt-0.5">Visão geral do seu funil de seleção</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/dashboard?formato=csv"
            className="rounded-full bg-white/[0.06] hover:bg-white/10 text-white/70 font-medium px-4 py-2.5 text-sm transition"
          >
            ⬇ CSV
          </a>
          {isAdmin && (
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="rounded-full bg-v4red hover:bg-v4redDark text-white font-semibold px-5 py-2.5 text-sm transition shadow-card"
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
          <p className="text-white/40 text-xs mb-4">Onde os candidatos avançam — e onde param</p>
          <GraficoFunil funil={data.funil} />
        </div>
        <div className="rounded-2xl border border-v4border bg-v4surface p-5 shadow-card">
          <h2 className="font-heading font-semibold mb-1">Distribuição de notas</h2>
          <p className="text-white/40 text-xs mb-4">
            Qualidade dos candidatos · {totais.concluidos} entrevista(s) pontuada(s)
          </p>
          <GraficoBarras dados={data.distribuicaoNotas} />
        </div>
      </section>

      {mostrarForm && (
        <NovaVagaWizard onCriar={criarVagaHandler} />
      )}

      <section>
        <h2 className="font-heading text-lg font-semibold mb-4">Vagas</h2>
        {vagas.length === 0 ? (
          <p className="text-white/50">Nenhuma vaga criada ainda. Clique em "+ Nova vaga".</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {vagas.map((v) => (
              <a
                key={v.id}
                href={`/vagas/${v.id}`}
                className="rounded-2xl border border-v4border bg-v4surface hover:bg-white/[0.06] hover:border-white/20 p-5 transition block shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">
                      {v.cargo} <span className="text-white/40 font-normal">· {v.senioridade}</span>
                    </div>
                    <div className="text-sm text-white/45 truncate">{v.segmento}</div>
                  </div>
                  <ScoreRing score={v.scoreMedio} size={48} />
                </div>

                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-white/[0.06] text-white/60">
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
                  <div className="mt-3 pt-3 border-t border-white/[0.06] text-sm text-white/70">
                    🏆 Top candidato: <span className="font-medium">{v.topCandidato.nome}</span>{' '}
                    <span className={corScore(v.topCandidato.scoreMedio)}>
                      ({v.topCandidato.scoreMedio?.toFixed(1)})
                    </span>
                  </div>
                )}
              </a>
            ))}
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
        <div className="text-xs text-white/50 uppercase tracking-wide">{label}</div>
        <span className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-sm">
          {icone}
        </span>
      </div>
      <div className={`text-2xl font-bold ${destaque ?? ''}`}>{value}</div>
    </div>
  );
}
