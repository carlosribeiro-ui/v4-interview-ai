'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import type { Candidatura, Vaga, Pergunta, FaseDef, CorFase } from '@/lib/types';
import { useToast } from '@/app/components/Toast';
import ScoreRing from '@/app/components/ScoreRing';
import Pill from '@/app/components/Pill';
import Barra from '@/app/components/Barra';
import { useSessao } from '@/app/components/Sessao';

type Filtro = 'todos' | 'concluida' | 'em_andamento';

const COR_FASE_CLASSES: Record<CorFase, { dot: string }> = {
  neutro: { dot: 'bg-fg/40' },
  atencao: { dot: 'bg-v4yellow' },
  sucesso: { dot: 'bg-v4green' },
  perigo: { dot: 'bg-v4red' }
};

const CORES_DISPONIVEIS: { valor: CorFase; label: string; classe: string }[] = [
  { valor: 'neutro', label: 'Neutro', classe: 'bg-fg/40' },
  { valor: 'atencao', label: 'Atenção', classe: 'bg-v4yellow' },
  { valor: 'sucesso', label: 'Sucesso', classe: 'bg-v4green' },
  { valor: 'perigo', label: 'Perigo', classe: 'bg-v4red' }
];

function idFaseNova() {
  return 'fase-' + Math.random().toString(36).slice(2, 9);
}

function corScore(score: number | null) {
  if (score === null) return 'text-fg/40';
  if (score >= 7) return 'text-v4green';
  if (score >= 4) return 'text-v4yellow';
  return 'text-v4red';
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  const primeiras = partes.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '');
  return primeiras.join('') || '?';
}

export default function VagaPage({ params }: { params: { id: string } }) {
  const { mostrar, ToastContainer } = useToast();
  const { usuario } = useSessao();
  const isAdmin = usuario?.role === 'admin';

  const [vaga, setVaga] = useState<Vaga | null>(null);
  const [candidaturas, setCandidaturas] = useState<Candidatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [editando, setEditando] = useState(false);
  const [editRequisitos, setEditRequisitos] = useState<string[]>([]);
  const [editPerguntas, setEditPerguntas] = useState<Pergunta[]>([]);
  const [editJobDescription, setEditJobDescription] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [link, setLink] = useState('');
  const [gerandoJD, setGerandoJD] = useState(false);
  const [gerandoRequisitos, setGerandoRequisitos] = useState(false);
  const [gerandoPerguntasIA, setGerandoPerguntasIA] = useState(false);

  const [gerenciandoFases, setGerenciandoFases] = useState(false);
  const [editFasesList, setEditFasesList] = useState<FaseDef[]>([]);
  const [salvandoFases, setSalvandoFases] = useState(false);
  const [erroFases, setErroFases] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setLink(`${window.location.origin}/entrevista/${params.id}`);
    }
  }, [params.id]);

  async function carregar() {
    const res = await fetch(`/api/vagas/${params.id}`);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json();
    setVaga(data.vaga);
    setCandidaturas(data.candidaturas);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    const interval = setInterval(carregar, 5000);
    return () => clearInterval(interval);
  }, [params.id]);

  async function alternarAtiva() {
    if (!vaga) return;
    const novaAtiva = !(vaga.ativa !== false);
    setVaga({ ...vaga, ativa: novaAtiva });
    const res = await fetch(`/api/vagas/${vaga.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativa: novaAtiva })
    });
    if (!res.ok) {
      setVaga((atual) => (atual ? { ...atual, ativa: !novaAtiva } : atual));
      mostrar('Não foi possível alterar o status da vaga.', 'erro');
    }
  }

  async function moverFase(candidaturaId: string, fase: string) {
    setCandidaturas((atual) => atual.map((c) => (c.id === candidaturaId ? { ...c, fase } : c)));
    const res = await fetch(`/candidaturas/${candidaturaId}/fase`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fase })
    });
    if (!res.ok) {
      carregar(); // reverte o otimismo se o servidor recusou
      mostrar('Não foi possível mover o candidato.', 'erro');
    }
  }

  async function adicionarNota(candidaturaId: string, texto: string) {
    const res = await fetch(`/candidaturas/${candidaturaId}/notas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto })
    });
    if (!res.ok) {
      mostrar('Não foi possível salvar a nota.', 'erro');
      return;
    }
    const atualizada = await res.json();
    setCandidaturas((atual) => atual.map((c) => (c.id === candidaturaId ? atualizada : c)));
  }

  function aoSoltarCard(event: DragEndEvent) {
    const candidaturaId = String(event.active.id);
    const novaFase = event.over?.id ? String(event.over.id) : null;
    if (!novaFase) return;
    const atual = candidaturas.find((c) => c.id === candidaturaId);
    if (!atual || atual.fase === novaFase) return;
    moverFase(candidaturaId, novaFase);
  }

  const stats = useMemo(() => {
    const concluidas = candidaturas.filter((c) => c.status === 'concluida');
    const scoreMedio = concluidas.length
      ? concluidas.reduce((sum, c) => sum + (c.scoreMedio ?? 0), 0) / concluidas.length
      : null;
    return {
      total: candidaturas.length,
      concluidos: concluidas.length,
      emAndamento: candidaturas.length - concluidas.length,
      scoreMedio: scoreMedio !== null ? Math.round(scoreMedio * 10) / 10 : null
    };
  }, [candidaturas]);

  function iniciarEdicao() {
    if (!vaga) return;
    setEditRequisitos([...vaga.requisitos]);
    setEditPerguntas(vaga.perguntas.map((p) => ({ ...p })));
    setEditJobDescription(vaga.jobDescription ?? '');
    setEditando(true);
  }

  async function salvarEdicao() {
    if (!vaga) return;
    setSalvando(true);
    try {
      const res = await fetch(`/api/vagas/${vaga.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requisitos: editRequisitos,
          perguntas: editPerguntas.map((p) => ({
            id: p.id,
            texto: p.texto,
            criterios: p.criterios,
            tipo: p.tipo ?? 'principal'
          })),
          jobDescription: editJobDescription
        })
      });
      if (!res.ok) throw new Error('Erro ao salvar');
      setEditando(false);
      mostrar('Vaga salva com sucesso!');
      carregar();
    } catch (err: any) {
      mostrar(err.message ?? 'Erro ao salvar', 'erro');
    } finally {
      setSalvando(false);
    }
  }

  /* ─── IA — gera cada bloco à parte (JD, requisitos/roteiro, perguntas) ───
     Funciona tanto em vaga nova quanto em vaga já existente/publicada — se um
     bloco já tem conteúdo, gerar outro não mexe nele. */

  async function gerarJDComIA(): Promise<string | null> {
    if (!vaga) return null;
    if (!editando) iniciarEdicao();
    setGerandoJD(true);
    try {
      const res = await fetch('/api/vagas/gerar-descricao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cargo: vaga.cargo, senioridade: vaga.senioridade, segmento: vaga.segmento,
          formacaoAcademica: vaga.formacaoAcademica, idiomaEntrevista: vaga.idiomaEntrevista,
          pais: vaga.pais, estado: vaga.estado, cidade: vaga.cidade
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao gerar Job Description');
      if (data.jobDescription) {
        setEditJobDescription(data.jobDescription);
        mostrar('Job Description gerada por IA — revise e salve.', 'sucesso');
        return data.jobDescription as string;
      }
      return null;
    } catch (err: any) {
      mostrar(err.message ?? 'Erro ao gerar Job Description', 'erro');
      return null;
    } finally {
      setGerandoJD(false);
    }
  }

  async function gerarRequisitosComIA(): Promise<string[] | null> {
    if (!vaga) return null;
    if (!editando) iniciarEdicao();
    setGerandoRequisitos(true);
    try {
      const res = await fetch('/api/vagas/gerar-descricao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cargo: vaga.cargo, senioridade: vaga.senioridade, segmento: vaga.segmento,
          formacaoAcademica: vaga.formacaoAcademica, idiomaEntrevista: vaga.idiomaEntrevista,
          pais: vaga.pais, estado: vaga.estado, cidade: vaga.cidade
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao gerar roteiro');
      if (data.requisitos?.length) {
        setEditRequisitos(data.requisitos);
        mostrar('Roteiro (requisitos) gerado por IA — revise e salve.', 'sucesso');
        return data.requisitos as string[];
      }
      return null;
    } catch (err: any) {
      mostrar(err.message ?? 'Erro ao gerar roteiro', 'erro');
      return null;
    } finally {
      setGerandoRequisitos(false);
    }
  }

  async function gerarPerguntasComIA(override?: { requisitos?: string[]; jobDescription?: string }) {
    if (!vaga) return;
    // Se vier override (chamado por gerarTudoComIA logo após gerar JD/requisitos), usa
    // ele — o state (editRequisitos/editJobDescription) só reflete o setState anterior
    // depois de um re-render, não dá pra confiar nele no mesmo fluxo síncrono.
    const reqAtual = (override?.requisitos ?? (editando ? editRequisitos : vaga.requisitos)).filter((r) => r.trim());
    if (reqAtual.length === 0) {
      mostrar('Gere ou preencha os requisitos (roteiro) antes de gerar as perguntas.', 'erro');
      return;
    }
    const jdAtual = override?.jobDescription ?? (editando ? editJobDescription : (vaga.jobDescription ?? ''));
    const numPerguntas = (editando ? editPerguntas.length : vaga.perguntas.length) || vaga.numeroPerguntas || 7;
    if (!editando) iniciarEdicao();
    setGerandoPerguntasIA(true);
    try {
      const res = await fetch('/api/vagas/gerar-perguntas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cargo: vaga.cargo, senioridade: vaga.senioridade, segmento: vaga.segmento,
          jobDescription: jdAtual, responsabilidades: vaga.responsabilidades,
          requisitos: reqAtual, numeroPerguntas: numPerguntas
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao gerar perguntas');
      if (data.perguntas?.length) {
        setEditPerguntas(
          data.perguntas.map((p: any) => ({
            id: 'pergunta-' + Math.random().toString(36).slice(2, 9),
            texto: p.texto,
            criterios: p.criterios,
            tipo: p.tipo ?? 'principal'
          }))
        );
        mostrar(`${data.perguntas.length} perguntas geradas por IA — revise e salve.`, 'sucesso');
      }
    } catch (err: any) {
      mostrar(err.message ?? 'Erro ao gerar perguntas', 'erro');
    } finally {
      setGerandoPerguntasIA(false);
    }
  }

  /** Botão único: gera JD (se vazia) → requisitos (se vazio) → perguntas, em sequência,
      encadeando o valor recém-gerado de cada etapa pra próxima (sem depender de state). */
  async function gerarTudoComIA() {
    if (!vaga) return;
    if (!editando) iniciarEdicao();
    let jd = editJobDescription || vaga.jobDescription || '';
    if (!jd) {
      jd = (await gerarJDComIA()) ?? '';
    }
    let reqs = (editando ? editRequisitos : vaga.requisitos).filter((r) => r.trim());
    if (reqs.length === 0) {
      reqs = (await gerarRequisitosComIA()) ?? [];
    }
    await gerarPerguntasComIA({ requisitos: reqs, jobDescription: jd });
  }

  function iniciarGerenciarFases() {
    if (!vaga) return;
    setEditFasesList(vaga.fases.map((f) => ({ ...f })));
    setErroFases(null);
    setGerenciandoFases(true);
  }

  function atualizarFase(i: number, patch: Partial<FaseDef>) {
    setEditFasesList((atual) => atual.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  function moverOrdemFase(i: number, delta: number) {
    setEditFasesList((atual) => {
      const j = i + delta;
      if (j < 0 || j >= atual.length) return atual;
      const next = [...atual];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function adicionarFase() {
    setEditFasesList((atual) => [...atual, { id: idFaseNova(), nome: 'Nova fase', cor: 'neutro' }]);
  }

  function removerFase(i: number) {
    setEditFasesList((atual) => atual.filter((_, idx) => idx !== i));
  }

  async function salvarFases() {
    if (!vaga) return;
    setSalvandoFases(true);
    setErroFases(null);
    try {
      const res = await fetch(`/api/vagas/${vaga.id}/fases`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fases: editFasesList })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar fases');
      setGerenciandoFases(false);
      mostrar('Fases atualizadas!');
      carregar();
    } catch (err: any) {
      setErroFases(err.message);
    } finally {
      setSalvandoFases(false);
    }
  }

  const candidaturasFiltradas = useMemo(() => {
    if (filtro === 'todos') return candidaturas;
    return candidaturas.filter((c) => c.status === filtro);
  }, [candidaturas, filtro]);

  const porFase = useMemo(() => {
    const grupos: Record<string, Candidatura[]> = {};
    for (const fase of vaga?.fases ?? []) grupos[fase.id] = [];
    for (const c of candidaturasFiltradas) {
      if (!grupos[c.fase]) grupos[c.fase] = [];
      grupos[c.fase].push(c);
    }
    for (const key of Object.keys(grupos)) {
      grupos[key].sort((a, b) => (b.scoreMedio ?? -1) - (a.scoreMedio ?? -1));
    }
    return grupos;
  }, [candidaturasFiltradas, vaga]);

  if (loading) return <p className="text-fg/50">Carregando…</p>;
  if (!vaga) return <p className="text-v4red">Vaga não encontrada.</p>;

  return (
    <div className="space-y-8">
      {ToastContainer}

      <div>
        <a href="/" className="text-sm text-fg/40 hover:text-fg/70">
          ← Dashboard
        </a>
        <div className="flex items-center gap-2.5 mt-1 flex-wrap">
          <h1 className="font-heading text-xl font-bold">
            {vaga.cargo} <span className="text-fg/40 font-normal">· {vaga.senioridade}</span>
          </h1>
          {isAdmin ? (
            <button
              onClick={alternarAtiva}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition ${
                vaga.ativa !== false
                  ? 'bg-v4green/15 text-v4green hover:bg-v4green/25'
                  : 'bg-fg/[0.06] text-fg/40 hover:bg-fg/10'
              }`}
            >
              {vaga.ativa !== false ? '● Ativa' : '○ Inativa'}
            </button>
          ) : (
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                vaga.ativa !== false ? 'bg-v4green/15 text-v4green' : 'bg-fg/[0.06] text-fg/40'
              }`}
            >
              {vaga.ativa !== false ? '● Ativa' : '○ Inativa'}
            </span>
          )}
        </div>
        <p className="text-fg/50">{vaga.segmento}</p>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Candidatos" value={stats.total} />
        <StatCard label="Concluídos" value={stats.concluidos} />
        <StatCard label="Em andamento" value={stats.emAndamento} destaque="text-v4yellow" />
        <StatCard
          label="Score médio"
          value={stats.scoreMedio !== null ? stats.scoreMedio.toFixed(1) : '—'}
          destaque={corScore(stats.scoreMedio)}
        />
      </section>

      <section className="bg-v4surface border border-fg/10 rounded p-5">
        <h2 className="font-heading font-semibold mb-2">Link para o candidato</h2>
        <div className="flex gap-2">
          <input
            readOnly
            value={link}
            className="flex-1 rounded bg-field/30 border border-fg/10 px-3 py-2 text-sm text-fg/70"
          />
          <button
            onClick={() => {
              navigator.clipboard.writeText(link);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1500);
            }}
            className="rounded bg-v4red hover:bg-v4redDark text-fg uppercase font-bold px-4 py-2 text-sm transition"
          >
            {copiado ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </section>

      {isAdmin && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={gerarTudoComIA}
            disabled={gerandoJD || gerandoRequisitos || gerandoPerguntasIA}
            title="Gera (ou completa) Job Description, roteiro/requisitos e perguntas de uma vez — o que já existir não é sobrescrito"
            className="flex items-center gap-2 rounded-full border border-v4green/30 text-v4green hover:bg-v4green/10 px-4 py-2 text-sm transition disabled:opacity-50"
          >
            {gerandoJD ? (
              <>⏳ Gerando Job Description…</>
            ) : gerandoRequisitos ? (
              <>⏳ Gerando roteiro…</>
            ) : gerandoPerguntasIA ? (
              <>⏳ Gerando perguntas…</>
            ) : (
              <>✨ Gerar por IA</>
            )}
          </button>
        </div>
      )}

      <section className="bg-v4surface border border-fg/10 rounded p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-semibold">
            Job Description {!vaga.jobDescription && !editando && <span className="text-fg/40 font-normal text-sm">(não cadastrada)</span>}
          </h2>
          {isAdmin && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={gerarJDComIA}
                disabled={gerandoJD}
                className="text-xs text-v4green hover:text-v4green/70 disabled:opacity-50"
              >
                {gerandoJD ? '⏳ Gerando…' : '✨ Gerar com IA'}
              </button>
              {!editando && (
                <button onClick={iniciarEdicao} className="text-xs text-v4red hover:text-v4redDark">
                  Editar
                </button>
              )}
            </div>
          )}
        </div>
        {editando ? (
          <textarea
            value={editJobDescription}
            onChange={(e) => setEditJobDescription(e.target.value)}
            rows={8}
            placeholder="Cole aqui a descrição completa da vaga — usada como fonte de verdade pela IA na geração do roteiro e na avaliação das respostas."
            className="w-full rounded bg-field/30 border border-fg/10 px-3 py-2 text-sm outline-none focus:border-v4red"
          />
        ) : vaga.jobDescription ? (
          <p className="text-sm text-fg/70 whitespace-pre-wrap">{vaga.jobDescription}</p>
        ) : (
          <p className="text-sm text-fg/40">
            Sem JD cadastrada — a IA usa cargo/senioridade/segmento + requisitos gerados. Clique em
            "Editar" pra colar a descrição completa da vaga.
          </p>
        )}
      </section>

      <section className="grid sm:grid-cols-2 gap-6">
        <div className="bg-v4surface border border-fg/10 rounded p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading font-semibold">Requisitos</h2>
            {isAdmin && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={gerarRequisitosComIA}
                  disabled={gerandoRequisitos}
                  className="text-xs text-v4green hover:text-v4green/70 disabled:opacity-50"
                >
                  {gerandoRequisitos ? '⏳ Gerando…' : '✨ Gerar roteiro com IA'}
                </button>
                {!editando && (
                  <button onClick={iniciarEdicao} className="text-xs text-v4red hover:text-v4redDark">
                    Editar
                  </button>
                )}
              </div>
            )}
          </div>
          {editando ? (
            <div className="space-y-2">
              {editRequisitos.map((r, i) => (
                <input key={i} value={r}
                  onChange={(e) => {
                    const next = [...editRequisitos];
                    next[i] = e.target.value;
                    setEditRequisitos(next);
                  }}
                  className="w-full rounded bg-field/30 border border-fg/10 px-2 py-1 text-sm outline-none focus:border-v4red" />
              ))}
            </div>
          ) : (
            <ul className="list-disc list-inside space-y-1 text-sm text-fg/70">
              {vaga.requisitos.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-v4surface border border-fg/10 rounded p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading font-semibold">Perguntas da entrevista</h2>
            {isAdmin && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => gerarPerguntasComIA()}
                  disabled={gerandoPerguntasIA}
                  className="text-xs text-v4green hover:text-v4green/70 disabled:opacity-50"
                >
                  {gerandoPerguntasIA ? '⏳ Gerando…' : '✨ Gerar com IA'}
                </button>
                {!editando && (
                  <button onClick={iniciarEdicao} className="text-xs text-v4red hover:text-v4redDark">
                    Editar
                  </button>
                )}
              </div>
            )}
          </div>
          {editando ? (
            <div className="space-y-3">
              {editPerguntas.map((p, i) => (
                <div key={p.id} className="border border-fg/10 rounded p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <input value={p.texto}
                      onChange={(e) => {
                        const next = [...editPerguntas];
                        next[i] = { ...next[i], texto: e.target.value };
                        setEditPerguntas(next);
                      }}
                      className="flex-1 rounded bg-field/30 border border-fg/10 px-2 py-1 text-sm outline-none focus:border-v4red" />
                    <select
                      value={p.tipo ?? 'principal'}
                      onChange={(e) => {
                        const next = [...editPerguntas];
                        next[i] = { ...next[i], tipo: e.target.value as 'principal' | 'adicional' };
                        setEditPerguntas(next);
                      }}
                      className="shrink-0 text-xs rounded-full bg-field/30 border border-fg/10 px-2 py-1 outline-none focus:border-v4red"
                    >
                      <option value="principal">Principal</option>
                      <option value="adicional">Adicional</option>
                    </select>
                  </div>
                  <textarea value={p.criterios}
                    onChange={(e) => {
                      const next = [...editPerguntas];
                      next[i] = { ...next[i], criterios: e.target.value };
                      setEditPerguntas(next);
                    }}
                    rows={2}
                    className="w-full rounded bg-field/30 border border-fg/10 px-2 py-1 text-sm outline-none focus:border-v4red" />
                </div>
              ))}
              <div className="flex items-center gap-2 pt-2">
                <button onClick={salvarEdicao} disabled={salvando}
                  className="rounded bg-v4red hover:bg-v4redDark disabled:opacity-50 text-fg uppercase font-bold px-3 py-1.5 text-sm">
                  {salvando ? 'Salvando…' : 'Salvar'}
                </button>
                <button onClick={() => setEditando(false)}
                  className="rounded border border-fg/10 text-fg/60 hover:text-fg/80 px-3 py-1.5 text-sm">
                  Cancelar
                </button>
                <a href="/admin/perguntas"
                  className="text-xs text-v4red/70 hover:text-v4red ml-2">
                  Analisar com IA →
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {(['principal', 'adicional'] as const).map((tipo) => {
                const lista = vaga.perguntas.filter((p) => (p.tipo ?? 'principal') === tipo);
                if (lista.length === 0) return null;
                return (
                  <div key={tipo}>
                    <p className="text-xs font-semibold text-fg/40 uppercase tracking-wide mb-2">
                      {tipo === 'principal' ? 'Principais' : 'Adicionais'} ({lista.length})
                    </p>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-fg/70">
                      {lista.map((p) => (
                        <li key={p.id}>{p.texto}</li>
                      ))}
                    </ol>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="font-heading text-lg font-semibold">Pipeline de seleção</h2>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 text-sm">
              {(
                [
                  ['todos', 'Todos'],
                  ['concluida', 'Concluídos'],
                  ['em_andamento', 'Em andamento']
                ] as [Filtro, string][]
              ).map(([valor, label]) => (
                <button
                  key={valor}
                  onClick={() => setFiltro(valor)}
                  className={`px-3 py-1.5 rounded border transition ${
                    filtro === valor
                      ? 'bg-v4red text-fg border-v4red font-medium'
                      : 'border-fg/10 text-fg/60 hover:bg-v4surface'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {isAdmin && (
              <button
                onClick={iniciarGerenciarFases}
                className="text-sm rounded border border-fg/10 text-fg/60 hover:text-fg hover:border-fg/30 px-3 py-1.5 transition"
              >
                ⚙ Gerenciar fases
              </button>
            )}
          </div>
        </div>

        {gerenciandoFases && (
          <div className="bg-v4surface border border-fg/10 rounded p-5 space-y-4 mb-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-semibold text-sm">Fases desta vaga</h3>
              <button onClick={() => setGerenciandoFases(false)} className="text-xs text-fg/50 hover:text-fg/80">
                Fechar
              </button>
            </div>
            {erroFases && <p className="text-sm text-v4red">{erroFases}</p>}
            <div className="space-y-2">
              {editFasesList.map((f, i) => (
                <div key={f.id} className="flex items-center gap-2 border border-fg/10 rounded p-2">
                  <div className="flex flex-col leading-none shrink-0">
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => moverOrdemFase(i, -1)}
                      className="disabled:opacity-20 text-fg/50 hover:text-fg text-xs px-1"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={i === editFasesList.length - 1}
                      onClick={() => moverOrdemFase(i, 1)}
                      className="disabled:opacity-20 text-fg/50 hover:text-fg text-xs px-1"
                    >
                      ▼
                    </button>
                  </div>
                  <input
                    value={f.nome}
                    onChange={(e) => atualizarFase(i, { nome: e.target.value })}
                    className="flex-1 min-w-0 rounded bg-field/30 border border-fg/10 px-2 py-1 text-sm outline-none focus:border-v4red"
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    {CORES_DISPONIVEIS.map((c) => (
                      <button
                        key={c.valor}
                        type="button"
                        title={c.label}
                        aria-label={`Cor ${c.label}`}
                        onClick={() => atualizarFase(i, { cor: c.valor })}
                        className={`w-5 h-5 rounded-full ${c.classe} ${
                          f.cor === c.valor ? 'ring-2 ring-fg' : 'opacity-40 hover:opacity-80'
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => removerFase(i)}
                    disabled={editFasesList.length === 1}
                    className="shrink-0 text-fg/40 hover:text-v4red disabled:opacity-20 text-sm px-1"
                    aria-label="Excluir fase"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={adicionarFase}
                className="rounded border border-fg/10 text-fg/60 hover:text-fg hover:border-fg/30 px-3 py-1.5 text-sm"
              >
                + Nova fase
              </button>
              <button
                type="button"
                onClick={salvarFases}
                disabled={salvandoFases}
                className="ml-auto rounded bg-v4red hover:bg-v4redDark disabled:opacity-50 text-fg uppercase font-bold px-4 py-1.5 text-sm"
              >
                {salvandoFases ? 'Salvando…' : 'Salvar fases'}
              </button>
            </div>
          </div>
        )}

        {candidaturasFiltradas.length === 0 ? (
          <p className="text-fg/50">Nenhum candidato nesse filtro.</p>
        ) : (
          <DndContext sensors={sensors} onDragEnd={aoSoltarCard}>
            <div className="overflow-x-auto pb-3">
              <div className="flex gap-4 min-w-max">
                {vaga.fases.map((fase) => (
                  <ColunaFase key={fase.id} fase={fase} total={(porFase[fase.id] ?? []).length}>
                    {(porFase[fase.id] ?? []).map((c) => (
                      <CardCandidato
                        key={c.id}
                        c={c}
                        vaga={vaga}
                        onAbrir={() => setAberta(c.id)}
                        onMoverFase={(f) => moverFase(c.id, f)}
                      />
                    ))}
                  </ColunaFase>
                ))}
              </div>
            </div>
          </DndContext>
        )}
      </section>

      {aberta &&
        (() => {
          const candidaturaAberta = candidaturas.find((c) => c.id === aberta);
          if (!candidaturaAberta) return null;
          return (
            <PerfilCandidatoModal
              c={candidaturaAberta}
              vaga={vaga}
              onClose={() => setAberta(null)}
              onMoverFase={(f) => moverFase(candidaturaAberta.id, f)}
              onAdicionarNota={(texto) => adicionarNota(candidaturaAberta.id, texto)}
            />
          );
        })()}
    </div>
  );
}

/** Coluna do kanban estilo Pipefy — cabeçalho colorido + cards empilhados verticalmente. */
function ColunaFase({
  fase,
  total,
  children
}: {
  fase: FaseDef;
  total: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: fase.id });
  const cor = COR_FASE_CLASSES[fase.cor];

  const corHeader: Record<CorFase, string> = {
    neutro: 'bg-fg/[0.06] border-fg/10',
    atencao: 'bg-v4yellow/10 border-v4yellow/30',
    sucesso: 'bg-v4green/10 border-v4green/30',
    perigo: 'bg-v4red/10 border-v4red/30'
  };

  return (
    <div className="w-72 shrink-0 flex flex-col">
      {/* Cabeçalho da fase — estilo Pipefy */}
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-xl border ${corHeader[fase.cor]}`}>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cor.dot}`} />
        <h3 className="text-sm font-semibold text-fg/80 flex-1 truncate">{fase.nome}</h3>
        <span className="text-xs font-medium text-fg/40 bg-v4surface px-2 py-0.5 rounded-full">{total}</span>
      </div>

      {/* Lista de cards — fundo sutil, borda lateral transparente */}
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2.5 p-2 rounded-b-xl border border-t-0 transition min-h-[6rem] ${
          isOver ? 'border-v4red/40 bg-v4red/5' : 'border-fg/5 bg-fg/[0.02]'
        }`}
      >
        {children}
        {total === 0 && (
          <div className="flex items-center justify-center h-16 text-xs text-fg/20 border border-dashed border-fg/10 rounded-lg">
            Arraste candidatos aqui
          </div>
        )}
      </div>
    </div>
  );
}

function CardCandidato({
  c,
  vaga,
  onAbrir,
  onMoverFase
}: {
  c: Candidatura;
  vaga: Vaga;
  onAbrir: () => void;
  onMoverFase: (fase: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`w-64 shrink-0 rounded-xl border border-v4border bg-v4surface hover:bg-fg/[0.06] hover:border-fg/15 overflow-hidden transition shadow-card ${
        isDragging ? 'opacity-40 relative z-10' : ''
      }`}
    >
      <div className="flex items-center gap-1.5 px-2 pt-2.5">
        <button
          {...listeners}
          {...attributes}
          aria-label="Arrastar candidato entre fases"
          className="shrink-0 cursor-grab active:cursor-grabbing text-fg/25 hover:text-fg/60 touch-none select-none px-1 py-1"
        >
          ⠿
        </button>
        <button
          onClick={onAbrir}
          aria-label={`Abrir perfil de ${c.nome}`}
          className="flex-1 min-w-0 flex items-center justify-between text-left py-1"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-full bg-v4red/15 text-v4red flex items-center justify-center text-xs font-bold">
              {iniciais(c.nome)}
            </div>
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{c.nome}</div>
              <div className="text-xs text-fg/40 truncate">{c.email}</div>
            </div>
          </div>
          <ScoreRing score={c.scoreMedio} size={40} strokeWidth={3.5} />
        </button>
      </div>

      <div className="px-3 pb-3 pt-2 pl-9 flex items-center gap-2">
        <Pill tom={c.status === 'concluida' ? 'verde' : 'amarelo'}>
          {c.status === 'concluida' ? 'Concluída' : 'Em andamento'}
        </Pill>
        <select
          value={c.fase}
          onChange={(e) => onMoverFase(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="ml-auto text-xs rounded-full bg-field/30 border border-fg/10 px-2.5 py-1 outline-none focus:border-v4red"
        >
          {vaga.fases.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Perfil do candidato em tela cheia — aberto ao clicar no card do kanban. */
function PerfilCandidatoModal({
  c,
  vaga,
  onClose,
  onMoverFase,
  onAdicionarNota
}: {
  c: Candidatura;
  vaga: Vaga;
  onClose: () => void;
  onMoverFase: (fase: string) => void;
  onAdicionarNota: (texto: string) => Promise<void>;
}) {
  const [novaNota, setNovaNota] = useState('');
  const [enviandoNota, setEnviandoNota] = useState(false);
  const [formatoExportando, setFormatoExportando] = useState<'csv' | 'pdf' | null>(null);
  const [erroExport, setErroExport] = useState('');
  const [detalheAberto, setDetalheAberto] = useState<Record<string, boolean>>({});

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', aoTeclar);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  async function exportarParecer(formato: 'csv' | 'pdf') {
    setFormatoExportando(formato);
    setErroExport('');
    try {
      const res = await fetch(`/candidaturas/${c.id}/parecer?formato=${formato}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Erro ao gerar parecer');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `parecer-${c.nome.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.${formato}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setErroExport(err.message ?? 'Erro ao gerar parecer');
    } finally {
      setFormatoExportando(null);
    }
  }

  async function enviarNota() {
    const texto = novaNota.trim();
    if (!texto) return;
    setEnviandoNota(true);
    try {
      await onAdicionarNota(texto);
      setNovaNota('');
    } finally {
      setEnviandoNota(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-field/85 backdrop-blur-sm flex flex-col v4-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full h-full sm:h-[95vh] sm:my-auto sm:max-w-4xl sm:mx-auto bg-v4bg sm:rounded-2xl sm:border sm:border-v4border flex flex-col overflow-hidden shadow-card">
        {/* Header fixo */}
        <div className="shrink-0 flex items-start justify-between gap-4 px-6 py-5 border-b border-v4border bg-v4surface">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 shrink-0 rounded-full bg-v4red/15 text-v4red flex items-center justify-center text-lg font-bold">
              {iniciais(c.nome)}
            </div>
            <div className="min-w-0">
              <h2 className="font-heading text-xl font-bold truncate">{c.nome}</h2>
              <p className="text-sm text-fg/50 truncate">{c.email}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Pill tom={c.status === 'concluida' ? 'verde' : 'amarelo'}>
                  {c.status === 'concluida' ? 'Concluída' : 'Em andamento'}
                </Pill>
                <select
                  value={c.fase}
                  onChange={(e) => onMoverFase(e.target.value)}
                  className="text-xs rounded-full bg-field/30 border border-fg/10 px-2.5 py-1 outline-none focus:border-v4red"
                >
                  {vaga.fases.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <ScoreRing score={c.scoreMedio} size={56} strokeWidth={4.5} />
            <button
              onClick={onClose}
              aria-label="Fechar perfil"
              className="w-9 h-9 rounded-full flex items-center justify-center text-fg/50 hover:text-fg hover:bg-fg/10 text-lg transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Corpo com scroll */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {(c.linkedin || c.telefone || c.pretensaoSalarial || c.curriculoPath) && (
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-fg/60 border-b border-fg/10 pb-4">
              {c.linkedin && (
                <a href={c.linkedin} target="_blank" rel="noreferrer" className="text-v4red hover:text-v4redDark">
                  🔗 LinkedIn
                </a>
              )}
              {c.telefone && <span>📞 {c.telefone}</span>}
              {c.pretensaoSalarial && <span>💰 {c.pretensaoSalarial}</span>}
              {c.curriculoPath && (
                <a href={c.curriculoPath} target="_blank" rel="noreferrer" className="text-v4red hover:text-v4redDark">
                  📄 Currículo
                </a>
              )}
            </div>
          )}

          {c.respostas.length === 0 && (
            <p className="text-fg/40 text-sm">Nenhuma resposta enviada ainda.</p>
          )}

          {c.respostas.length > 0 && (
            <div className="flex items-center gap-3">
              {(() => {
                const aindaAvaliando = c.respostas.some((r) => r.avaliando);
                const desabilitado = formatoExportando !== null || aindaAvaliando;
                const rotulo = c.parecer ? 'Exportar parecer' : 'Gerar e exportar parecer';
                return (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => exportarParecer('pdf')}
                      disabled={desabilitado}
                      title={aindaAvaliando ? 'Aguarde as respostas terminarem de ser avaliadas' : undefined}
                      className="rounded border border-v4red/40 text-v4red hover:bg-v4red/10 disabled:opacity-50 text-xs font-semibold uppercase px-3 py-2"
                    >
                      {aindaAvaliando
                        ? '⏳ Aguardando avaliação…'
                        : formatoExportando === 'pdf'
                          ? 'Gerando…'
                          : c.parecer
                            ? '📄 ' + rotulo + ' (PDF)'
                            : '✨ ' + rotulo + ' (PDF)'}
                    </button>
                    {!aindaAvaliando && (
                      <button
                        onClick={() => exportarParecer('csv')}
                        disabled={desabilitado}
                        className="rounded border border-v4green/40 text-v4green hover:bg-v4green/10 disabled:opacity-50 text-xs font-semibold uppercase px-3 py-2"
                      >
                        {formatoExportando === 'csv' ? 'Gerando…' : '📊 ' + rotulo + ' (CSV)'}
                      </button>
                    )}
                  </div>
                );
              })()}
              {erroExport && <span className="text-v4red text-xs">{erroExport}</span>}
            </div>
          )}

          <div className="space-y-5">
            {c.respostas.map((r, i) => {
              const pergunta = vaga.perguntas.find((p) => p.id === r.perguntaId);
              return (
                <div key={r.perguntaId} className="rounded-2xl border border-v4border bg-fg/[0.025] p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-fg/80">
                      <span className="text-fg/40">Pergunta {i + 1} · </span>
                      {pergunta?.texto ?? 'Pergunta'}
                    </p>
                    {r.avaliando ? (
                      <span className="shrink-0 w-[34px] h-[34px] rounded-full border-2 border-v4yellow/30 border-t-v4yellow animate-spin" />
                    ) : (
                      <ScoreRing score={r.score} size={34} strokeWidth={3} />
                    )}
                  </div>
                  <video src={r.videoPath} controls className="w-full rounded-xl bg-field aspect-video" />
                  {r.avaliando && (
                    <Pill tom="amarelo">⏳ Vídeo salvo — transcrevendo e avaliando em background…</Pill>
                  )}
                  {!r.avaliando && r.estaLendo !== undefined && (
                    <Pill tom={r.estaLendo ? 'vermelho' : 'verde'}>
                      {r.estaLendo ? '⚠️ Possível leitura de script' : '✅ Sem indícios de leitura'}
                      {' · confiança '}
                      {Math.round((r.confiancaLeitura ?? 0) * 100)}%
                    </Pill>
                  )}
                  {!!r.perdeuFoco?.vezes && (
                    <Pill tom="amarelo">
                      👁️ Saiu da aba {r.perdeuFoco.vezes}x durante a resposta ({r.perdeuFoco.segundosFora}s fora)
                    </Pill>
                  )}
                  {(r.tentativas ?? 1) > 1 && (
                    <Pill tom="amarelo">🔁 Gravada {r.tentativas}x (vale a última)</Pill>
                  )}
                  {!!r.sinaisIntegridade?.length && (
                    <div className="rounded-xl border border-v4red/30 bg-v4red/5 px-3.5 py-3 space-y-2">
                      <p className="text-xs font-semibold text-v4red uppercase">
                        Integridade da gravação — {r.sinaisIntegridade.length} {r.sinaisIntegridade.length === 1 ? 'indício' : 'indícios'}
                      </p>
                      {r.sinaisIntegridade.map((s, idx) => (
                        <p key={idx} className="text-xs text-fg/70">
                          <span className="text-fg/50">{s.peso === 'alto' ? '🔴' : '🟡'} </span>
                          {s.detalhe}
                        </p>
                      ))}
                      <p className="text-[11px] text-fg/40 pt-1">
                        Indícios técnicos, não prova de fraude — confirme antes de decidir.
                      </p>
                    </div>
                  )}
                  {!r.avaliando && (
                    <p className="text-xs text-fg/40">
                      Transcrição: <span className="text-fg/70">{r.transcricao || '—'}</span>
                    </p>
                  )}
                  {!r.avaliando && <p className="text-sm text-fg/60">{r.feedback}</p>}
                  {!r.avaliando && r.pontoAtencao && (
                    <div className="rounded-xl border border-v4yellow/30 bg-v4yellow/5 px-3.5 py-3 space-y-1.5">
                      <p className="text-xs font-semibold text-v4yellow uppercase tracking-wide">Ponto de atenção</p>
                      <p className="text-xs text-fg/70">
                        <span className="text-fg/50">Lacuna: </span>
                        {r.pontoAtencao.lacuna}
                      </p>
                      <p className="text-xs text-fg/70">
                        <span className="text-fg/50">Impacto: </span>
                        {r.pontoAtencao.impacto}
                      </p>
                      <p className="text-xs text-fg/70">
                        <span className="text-fg/50">Como validar: </span>
                        {r.pontoAtencao.comoValidar}
                      </p>
                    </div>
                  )}

                  {(r.qualidadeDiscurso || r.competenciasEssenciais) && (
                    <div className="pt-1">
                      <button
                        onClick={() =>
                          setDetalheAberto((atual) => ({ ...atual, [r.perguntaId]: !atual[r.perguntaId] }))
                        }
                        className="text-xs text-v4red hover:text-v4redDark font-medium"
                      >
                        {detalheAberto[r.perguntaId] ? '▲ Ocultar análise detalhada' : '📊 Ver análise detalhada (IA)'}
                      </button>

                      {detalheAberto[r.perguntaId] && (
                        <div className="mt-3 space-y-4 v4-fade-in">
                          {r.qualidadeDiscurso && (
                            <div className="rounded-xl border border-v4border bg-field/20 p-3.5 space-y-2.5">
                              <p className="text-xs font-semibold text-fg/70 uppercase tracking-wide">
                                Qualidade da resposta
                              </p>
                              <Barra label="Naturalidade" valor={r.qualidadeDiscurso.naturalidade} corIndice={0} />
                              <Barra label="Personalização" valor={r.qualidadeDiscurso.personalizacao} corIndice={1} />
                              <Barra label="Complexidade" valor={r.qualidadeDiscurso.complexidade} corIndice={2} />
                              <Barra
                                label="Padrões linguísticos"
                                valor={r.qualidadeDiscurso.padroesLinguisticos}
                                corIndice={3}
                              />
                              <Barra label="Contexto" valor={r.qualidadeDiscurso.contexto} corIndice={4} />
                            </div>
                          )}

                          {r.qualidadeConteudo && (
                            <div className="rounded-xl border border-v4border bg-field/20 p-3.5 space-y-2.5">
                              <p className="text-xs font-semibold text-fg/70 uppercase tracking-wide">Conteúdo</p>
                              <Barra label="Profundidade" valor={r.qualidadeConteudo.profundidade} corIndice={0} />
                              <Barra label="Estrutura" valor={r.qualidadeConteudo.estrutura} corIndice={1} />
                              <Barra label="Exemplos" valor={r.qualidadeConteudo.exemplos} corIndice={2} />
                            </div>
                          )}

                          {r.competenciasEssenciais && r.competenciasEssenciais.length > 0 && (
                            <div className="rounded-xl border border-v4border bg-field/20 p-3.5 space-y-2.5">
                              <p className="text-xs font-semibold text-fg/70 uppercase tracking-wide">
                                Competências essenciais
                              </p>
                              {r.competenciasEssenciais.map((comp, j) => (
                                <Barra key={j} label={comp.nome} valor={comp.score} corIndice={j} />
                              ))}
                            </div>
                          )}

                          {r.competenciasAdicionais && r.competenciasAdicionais.length > 0 && (
                            <div className="rounded-xl border border-v4border bg-field/20 p-3.5 space-y-2.5">
                              <p className="text-xs font-semibold text-fg/70 uppercase tracking-wide">
                                Competências adicionais
                              </p>
                              {r.competenciasAdicionais.map((comp, j) => (
                                <Barra key={j} label={comp.nome} valor={comp.score} corIndice={j} />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-fg/10 pt-4 space-y-2">
            <p className="text-xs font-semibold text-fg/50 uppercase">Notas internas</p>
            {(c.notasInternas ?? []).length === 0 && (
              <p className="text-fg/40 text-xs">Nenhuma nota ainda.</p>
            )}
            {(c.notasInternas ?? []).map((n) => (
              <div key={n.id} className="text-sm bg-field/20 rounded px-2.5 py-1.5">
                <p className="text-fg/80">{n.texto}</p>
                <p className="text-fg/30 text-xs mt-0.5">
                  {new Date(n.criadoEm).toLocaleString('pt-BR')}
                </p>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                value={novaNota}
                onChange={(e) => setNovaNota(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') enviarNota();
                }}
                placeholder="Adicionar nota…"
                className="flex-1 rounded bg-field/30 border border-fg/10 px-2 py-1.5 text-sm outline-none focus:border-v4red"
              />
              <button
                onClick={enviarNota}
                disabled={enviandoNota || !novaNota.trim()}
                className="rounded bg-v4red hover:bg-v4redDark disabled:opacity-50 text-fg text-xs font-bold uppercase px-3 py-1.5"
              >
                {enviandoNota ? '…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  destaque
}: {
  label: string;
  value: string | number;
  destaque?: string;
}) {
  return (
    <div className="rounded border border-fg/10 bg-v4surface p-4">
      <div className="text-xs text-fg/50 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${destaque ?? ''}`}>{value}</div>
    </div>
  );
}
