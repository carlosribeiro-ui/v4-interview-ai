'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ScoreRing from '@/app/components/ScoreRing';
import Pill from '@/app/components/Pill';
import type { CandidatoEnriquecido } from '@/app/api/candidatos/route';

type Filtro = 'todos' | 'concluida' | 'em_andamento';

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export default function CandidatosPage() {
  return (
    <Suspense fallback={<p className="text-white/50">Carregando…</p>}>
      <CandidatosPageInner />
    </Suspense>
  );
}

function CandidatosPageInner() {
  const searchParams = useSearchParams();
  const statusInicial = (searchParams.get('status') as Filtro) ?? 'todos';

  const [candidatos, setCandidatos] = useState<CandidatoEnriquecido[]>([]);
  const [vagas, setVagas] = useState<{ id: string; cargo: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>(statusInicial);
  const [vagaFiltro, setVagaFiltro] = useState('');
  const [faixaScore, setFaixaScore] = useState('');

  async function carregar() {
    const params = new URLSearchParams();
    if (filtro !== 'todos') params.set('status', filtro);
    if (busca) params.set('q', busca);
    if (vagaFiltro) params.set('vagaId', vagaFiltro);
    if (faixaScore === 'alto') params.set('scoreMin', '7');
    if (faixaScore === 'medio') {
      params.set('scoreMin', '4');
      params.set('scoreMax', '6.99');
    }
    if (faixaScore === 'baixo') params.set('scoreMax', '3.99');

    const res = await fetch(`/api/candidatos?${params.toString()}`);
    const data = await res.json();
    setCandidatos(data.candidatos);
    setVagas(data.vagas);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, busca, vagaFiltro, faixaScore]);

  function baixarCsv() {
    const params = new URLSearchParams();
    if (filtro !== 'todos') params.set('status', filtro);
    if (busca) params.set('q', busca);
    if (vagaFiltro) params.set('vagaId', vagaFiltro);
    params.set('formato', 'csv');
    window.location.href = `/api/candidatos?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Candidatos</h1>
          <p className="text-white/40 text-sm mt-0.5">
            Visualize, filtre e exporte todos os candidatos, de todas as vagas.
          </p>
        </div>
        <button
          onClick={baixarCsv}
          className="rounded-full bg-v4green/15 text-v4green hover:bg-v4green/25 font-semibold px-4 py-2 text-sm transition"
        >
          ⬇ Baixar CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar por nome ou email…"
          className="flex-1 min-w-[220px] rounded-full bg-v4surface border border-v4border px-4 py-2.5 text-sm outline-none focus:border-v4red"
        />
        <select
          value={vagaFiltro}
          onChange={(e) => setVagaFiltro(e.target.value)}
          className="rounded-full bg-v4surface border border-v4border px-3 py-2.5 text-sm outline-none focus:border-v4red"
        >
          <option value="">Todas as vagas</option>
          {vagas.map((v) => (
            <option key={v.id} value={v.id}>
              {v.cargo}
            </option>
          ))}
        </select>
        <select
          value={faixaScore}
          onChange={(e) => setFaixaScore(e.target.value)}
          className="rounded-full bg-v4surface border border-v4border px-3 py-2.5 text-sm outline-none focus:border-v4red"
        >
          <option value="">Todos os scores</option>
          <option value="alto">Alto (≥7)</option>
          <option value="medio">Médio (4–7)</option>
          <option value="baixo">Baixo (&lt;4)</option>
        </select>
      </div>

      <div className="flex gap-1.5">
        {(
          [
            ['todos', 'Todos'],
            ['em_andamento', 'Em andamento'],
            ['concluida', 'Concluídos']
          ] as [Filtro, string][]
        ).map(([valor, label]) => (
          <button
            key={valor}
            onClick={() => setFiltro(valor)}
            className={`px-3.5 py-1.5 rounded-full text-sm transition ${
              filtro === valor ? 'bg-v4red text-white font-medium' : 'bg-white/[0.05] text-white/60 hover:bg-white/10'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-white/50">Carregando…</p>
      ) : candidatos.length === 0 ? (
        <p className="text-white/50">Nenhum candidato encontrado com esses filtros.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {candidatos.map((c) => (
            <a
              key={c.id}
              href={`/vagas/${c.vagaId}`}
              className="rounded-2xl border border-v4border bg-v4surface hover:bg-white/[0.06] hover:border-white/20 p-4 transition shadow-card"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 shrink-0 rounded-full bg-v4red/15 text-v4red flex items-center justify-center text-xs font-bold">
                    {iniciais(c.nome)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{c.nome}</div>
                    <div className="text-xs text-white/40 truncate">{c.email}</div>
                  </div>
                </div>
                <ScoreRing score={c.scoreMedio} size={40} strokeWidth={3.5} />
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Pill tom="neutro">{c.vagaCargo}</Pill>
                <Pill tom={c.status === 'concluida' ? 'verde' : 'amarelo'}>
                  {c.status === 'concluida' ? 'Concluída' : 'Em andamento'}
                </Pill>
              </div>
              <p className="text-xs text-white/30 mt-2">
                {new Date(c.createdAt).toLocaleString('pt-BR')}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
