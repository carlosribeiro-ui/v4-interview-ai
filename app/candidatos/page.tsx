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

type Talent = { id: string; nome: string; email: string; role: string };

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
  const [talents, setTalents] = useState<Talent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [vagaFiltro, setVagaFiltro] = useState(searchParams.get('vagaId') ?? '');
  const [faixaScore, setFaixaScore] = useState('');
  const [mostrarTestes, setMostrarTestes] = useState(false);
  const [candidaturaAberta, setCandidaturaAberta] = useState<any>(null);
  const [vagaAberta, setVagaAberta] = useState<any>(null);
  const [carregandoPerfil, setCarregandoPerfil] = useState(false);

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
    fetch('/api/usuarios').then((r) => r.json()).then((d) => setTalents(d.filter((u: Talent) => u.role === 'talent')));
    carregar();
  }, [busca, vagaFiltro, faixaScore, mostrarTestes]);

  async function atribuirTalent(candidaturaId: string, email: string) {
    setCandidatos((atual) => atual.map((c) => c.id === candidaturaId ? { ...c, talentResponsavel: email || undefined } : c));
    const res = await fetch(`/api/candidaturas/${candidaturaId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ talentResponsavel: email })
    });
    if (!res.ok) carregar();
  }

  async function abrirPerfil(c: CandidatoEnriquecido) {
    setCarregandoPerfil(true);
    setCandidaturaAberta(null);
    setVagaAberta(null);
    try {
      const [resCand, resVaga] = await Promise.all([
        fetch(`/api/candidaturas/${c.id}`),
        fetch(`/api/vagas/${c.vagaId}`)
      ]);
      if (resCand.ok) {
        const data = await resCand.json();
        setCandidaturaAberta(data.candidatura);
      }
      if (resVaga.ok) {
        const data = await resVaga.json();
        setVagaAberta(data.vaga);
      }
    } finally {
      setCarregandoPerfil(false);
    }
  }

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
                      <div
                        key={c.id}
                        onClick={() => abrirPerfil(c)}
                        className="rounded-xl border border-v4border bg-v4surface hover:bg-white/[0.06] hover:border-white/15 p-3 transition shadow-card cursor-pointer"
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
                        {/* Atribuição de talent */}
                        <div className="mt-2 pt-2 border-t border-white/5">
                          <select
                            value={c.talentResponsavel ?? ''}
                            onChange={(e) => { e.stopPropagation(); atribuirTalent(c.id, e.target.value); }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full text-[11px] rounded bg-black/30 border border-white/10 px-2 py-1 outline-none focus:border-v4red text-white/60"
                          >
                            <option value="">Sem talent atribuído</option>
                            {talents.map((t) => (
                              <option key={t.email} value={t.email}>{t.nome}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de perfil do candidato */}
      {carregandoPerfil && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center">
          <div className="text-white/50">Carregando perfil…</div>
        </div>
      )}
      {candidaturaAberta && vagaAberta && (
        <PerfilCandidatoModal
          c={candidaturaAberta}
          vaga={vagaAberta}
          onClose={() => { setCandidaturaAberta(null); setVagaAberta(null); }}
        />
      )}
    </div>
  );
}

/** Modal com perfil completo do candidato — vídeo, transcrição, feedback, notas. */
function PerfilCandidatoModal({
  c, vaga, onClose
}: {
  c: any;
  vaga: any;
  onClose: () => void;
}) {
  const [detalheAberto, setDetalheAberto] = useState<Record<string, boolean>>({});

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', aoTeclar);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', aoTeclar); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col v4-fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full h-full sm:h-[95vh] sm:my-auto sm:max-w-4xl sm:mx-auto bg-v4bg sm:rounded-2xl sm:border sm:border-v4border flex flex-col overflow-hidden shadow-card">
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between gap-4 px-6 py-5 border-b border-v4border bg-white/[0.02]">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 shrink-0 rounded-full bg-v4red/15 text-v4red flex items-center justify-center text-lg font-bold">{iniciais(c.nome)}</div>
            <div className="min-w-0">
              <h2 className="font-heading text-xl font-bold truncate">{c.nome}</h2>
              <p className="text-sm text-white/50 truncate">{c.email}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Pill tom={c.status === 'concluida' ? 'verde' : 'amarelo'}>{c.status === 'concluida' ? 'Concluída' : 'Em andamento'}</Pill>
                <Pill tom="neutro">{vaga.cargo} · {vaga.senioridade}</Pill>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <ScoreRing score={c.scoreMedio} size={56} strokeWidth={4.5} />
            <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 text-lg transition">✕</button>
          </div>
        </div>
        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {(c.linkedin || c.telefone || c.pretensaoSalarial || c.curriculoPath) && (
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-white/60 border-b border-white/10 pb-4">
              {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" className="text-v4red hover:text-v4redDark">🔗 LinkedIn</a>}
              {c.telefone && <span>📞 {c.telefone}</span>}
              {c.pretensaoSalarial && <span>💰 {c.pretensaoSalarial}</span>}
              {c.curriculoPath && <a href={c.curriculoPath} target="_blank" rel="noreferrer" className="text-v4red hover:text-v4redDark">📄 Currículo</a>}
            </div>
          )}
          {c.respostas?.length === 0 && <p className="text-white/40 text-sm">Nenhuma resposta enviada ainda.</p>}
          <div className="space-y-5">
            {c.respostas?.map((r: any, i: number) => {
              const pergunta = vaga.perguntas?.find((p: any) => p.id === r.perguntaId);
              return (
                <div key={r.perguntaId} className="rounded-2xl border border-v4border bg-white/[0.025] p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-white/80"><span className="text-white/40">Pergunta {i + 1} · </span>{pergunta?.texto ?? 'Pergunta'}</p>
                    {r.avaliando ? <span className="shrink-0 w-[34px] h-[34px] rounded-full border-2 border-v4yellow/30 border-t-v4yellow animate-spin" /> : <ScoreRing score={r.score} size={34} strokeWidth={3} />}
                  </div>
                  <video src={r.videoPath} controls className="w-full rounded-xl bg-black aspect-video" />
                  {r.avaliando && <Pill tom="amarelo">⏳ Processando…</Pill>}
                  {!r.avaliando && r.estaLendo !== undefined && <Pill tom={r.estaLendo ? 'vermelho' : 'verde'}>{r.estaLendo ? '⚠️ Possível leitura' : '✅ Sem indícios'} · {Math.round((r.confiancaLeitura ?? 0) * 100)}%</Pill>}
                  {!r.avaliando && <p className="text-xs text-white/40">Transcrição: <span className="text-white/70">{r.transcricao || '—'}</span></p>}
                  {!r.avaliando && <p className="text-sm text-white/60">{r.feedback}</p>}
                  {!r.avaliando && r.pontoAtencao && (
                    <div className="rounded-xl border border-v4yellow/30 bg-v4yellow/5 px-3.5 py-3 space-y-1.5">
                      <p className="text-xs font-semibold text-v4yellow uppercase">Ponto de atenção</p>
                      <p className="text-xs text-white/70"><span className="text-white/50">Lacuna: </span>{r.pontoAtencao.lacuna}</p>
                      <p className="text-xs text-white/70"><span className="text-white/50">Impacto: </span>{r.pontoAtencao.impacto}</p>
                      <p className="text-xs text-white/70"><span className="text-white/50">Como validar: </span>{r.pontoAtencao.comoValidar}</p>
                    </div>
                  )}
                  {r.qualidadeDiscurso && (
                    <button onClick={() => setDetalheAberto((a) => ({ ...a, [r.perguntaId]: !a[r.perguntaId] }))} className="text-xs text-v4red hover:text-v4redDark font-medium">
                      {detalheAberto[r.perguntaId] ? '▲ Ocultar' : '📊 Ver análise detalhada'}
                    </button>
                  )}
                  {detalheAberto[r.perguntaId] && r.qualidadeDiscurso && (
                    <div className="mt-3 space-y-3 v4-fade-in">
                      <div className="rounded-xl border border-v4border bg-black/20 p-3.5 space-y-2">
                        <p className="text-xs font-semibold text-white/70 uppercase">Discurso</p>
                        {Object.entries(r.qualidadeDiscurso).map(([k, v]) => (
                          <div key={k} className="flex items-center gap-2 text-xs"><span className="w-28 text-white/50 capitalize">{k}</span><div className="flex-1 h-1.5 rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-v4red" style={{ width: `${Number(v)}%` }} /></div><span className="w-8 text-right text-white/60">{String(v)}</span></div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
