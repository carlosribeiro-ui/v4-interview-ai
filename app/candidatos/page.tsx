'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ScoreRing from '@/app/components/ScoreRing';
import Pill from '@/app/components/Pill';
import type { CandidatoEnriquecido } from '@/app/api/candidatos/route';

type FiltroStatus = 'todos' | 'em_andamento' | 'concluida';

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/** Mapeia status + faseId pra coluna do Kanban global. */
function colunaDo(c: CandidatoEnriquecido): 'em_andamento' | 'concluido' | 'aprovado' | 'reprovado' {
  if (c.status !== 'concluida') return 'em_andamento';
  if (c.faseId === 'aprovado') return 'aprovado';
  if (c.faseId === 'reprovado') return 'reprovado';
  return 'concluido';
}

const COLUNAS = [
  { id: 'em_andamento', nome: 'Em andamento', cor: 'bg-v4yellow/10 border-v4yellow/30', dot: 'bg-v4yellow' },
  { id: 'concluido', nome: 'Aguardando análise', cor: 'bg-white/[0.04] border-white/10', dot: 'bg-white/40' },
  { id: 'aprovado', nome: 'Aprovados', cor: 'bg-v4green/10 border-v4green/30', dot: 'bg-v4green' },
  { id: 'reprovado', nome: 'Reprovados', cor: 'bg-v4red/10 border-v4red/30', dot: 'bg-v4red' }
] as const;

export default function CandidatosPage() {
  return (
    <Suspense fallback={<p className="text-white/50">Carregando…</p>}>
      <CandidatosPageInner />
    </Suspense>
  );
}

function CandidatosPageInner() {
  const searchParams = useSearchParams();

  const [candidatos, setCandidatos] = useState<CandidatoEnriquecido[]>([]);
  const [vagas, setVagas] = useState<{ id: string; cargo: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [vagaFiltro, setVagaFiltro] = useState(searchParams.get('vagaId') ?? '');
  const [faixaScore, setFaixaScore] = useState('');
  const [mostrarTestes, setMostrarTestes] = useState(false);

  async function carregar() {
    const params = new URLSearchParams();
    if (busca) params.set('q', busca);
    if (vagaFiltro) params.set('vagaId', vagaFiltro);
    if (faixaScore === 'alto') params.set('scoreMin', '7');
    if (faixaScore === 'medio') { params.set('scoreMin', '4'); params.set('scoreMax', '6.99'); }
    if (faixaScore === 'baixo') params.set('scoreMax', '3.99');
    if (mostrarTestes) params.set('incluirTestes', '1');

    const res = await fetch(`/api/candidatos?${params.toString()}`);
    const data = await res.json();
    setCandidatos(data.candidatos);
    setVagas(data.vagas);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, [busca, vagaFiltro, faixaScore, mostrarTestes]);

  const porColuna = useMemo(() => {
    const grupos: Record<string, CandidatoEnriquecido[]> = {
      em_andamento: [], concluido: [], aprovado: [], reprovado: []
    };
    for (const c of candidatos) {
      grupos[colunaDo(c)].push(c);
    }
    // Ordena por score desc dentro de cada coluna
    for (const key of Object.keys(grupos)) {
      grupos[key].sort((a, b) => (b.scoreMedio ?? -1) - (a.scoreMedio ?? -1));
    }
    return grupos;
  }, [candidatos]);

  function baixarCsv() {
    const params = new URLSearchParams();
    if (busca) params.set('q', busca);
    if (vagaFiltro) params.set('vagaId', vagaFiltro);
    params.set('formato', 'csv');
    window.location.href = `/api/candidatos?${params.toString()}`;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Candidatos</h1>
          <p className="text-white/40 text-sm mt-0.5">
            Pipeline global — todas as vagas em um só lugar.
          </p>
        </div>
        <button
          onClick={baixarCsv}
          className="rounded-full bg-v4green/15 text-v4green hover:bg-v4green/25 font-semibold px-4 py-2 text-sm transition"
        >
          ⬇ Baixar CSV
        </button>
      </div>

      {/* Filtros */}
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
            <option key={v.id} value={v.id}>{v.cargo}</option>
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
        <label className="flex items-center gap-1.5 text-xs text-white/50 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={mostrarTestes}
            onChange={(e) => setMostrarTestes(e.target.checked)}
            className="accent-v4red"
          />
          Testes 🧪
        </label>
      </div>

      {/* Kanban global */}
      {loading ? (
        <p className="text-white/50">Carregando…</p>
      ) : candidatos.length === 0 ? (
        <p className="text-white/50">Nenhum candidato encontrado com esses filtros.</p>
      ) : (
        <div className="overflow-x-auto pb-3">
          <div className="flex gap-4 min-w-max">
            {COLUNAS.map((col) => (
              <div key={col.id} className="w-72 shrink-0 flex flex-col">
                {/* Cabeçalho da coluna */}
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-xl border ${col.cor}`}>
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${col.dot}`} />
                  <h3 className="text-sm font-semibold text-white/80 flex-1 truncate">{col.nome}</h3>
                  <span className="text-xs font-medium text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                    {porColuna[col.id].length}
                  </span>
                </div>

                {/* Cards */}
                <div className={`flex-1 space-y-2.5 p-2 rounded-b-xl border border-t-0 min-h-[6rem] ${col.cor}`}>
                  {porColuna[col.id].length === 0 ? (
                    <div className="flex items-center justify-center h-16 text-xs text-white/20 border border-dashed border-white/10 rounded-lg">
                      Nenhum candidato
                    </div>
                  ) : (
                    porColuna[col.id].map((c) => (
                      <a
                        key={c.id}
                        href={`/vagas/${c.vagaId}`}
                        className="block rounded-xl border border-v4border bg-v4surface hover:bg-white/[0.06] hover:border-white/15 p-3 transition shadow-card"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 shrink-0 rounded-full bg-v4red/15 text-v4red flex items-center justify-center text-xs font-bold">
                            {iniciais(c.nome)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{c.nome}</div>
                            <div className="text-xs text-white/40 truncate">{c.vagaCargo}</div>
                          </div>
                          <ScoreRing score={c.scoreMedio} size={38} strokeWidth={3} />
                        </div>
                        <div className="flex items-center gap-1.5 mt-2">
                          <Pill tom={c.status === 'concluida' ? 'verde' : 'amarelo'}>
                            {c.status === 'concluida' ? 'Concluída' : 'Em andamento'}
                          </Pill>
                          {c.teste && <Pill tom="neutro">🧪</Pill>}
                          <span className="text-[10px] text-white/25 ml-auto">
                            {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </a>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
