'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessao } from '@/app/components/Sessao';

type VagaResumo = { id: string; cargo: string; senioridade: string; segmento: string };

export default function TestarEntrevistaPage() {
  const router = useRouter();
  const { usuario } = useSessao();

  const [vagas, setVagas] = useState<VagaResumo[]>([]);
  const [vagaId, setVagaId] = useState('');
  const [loading, setLoading] = useState(true);
  const [iniciando, setIniciando] = useState(false);
  const [erro, setErro] = useState('');

  const [criandoNova, setCriandoNova] = useState(false);
  const [cargo, setCargo] = useState('');
  const [senioridade, setSenioridade] = useState('Pleno');
  const [segmento, setSegmento] = useState('');
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    fetch('/api/vagas')
      .then((r) => r.json())
      .then((data: VagaResumo[]) => {
        setVagas(data);
        if (data.length > 0) setVagaId(data[0].id);
        setLoading(false);
      });
  }, []);

  async function criarVagaDeTeste(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setGerando(true);
    try {
      const res = await fetch('/api/vagas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cargo, senioridade, segmento })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao criar vaga');
      setVagas((v) => [{ id: data.id, cargo: data.cargo, senioridade: data.senioridade, segmento: data.segmento }, ...v]);
      setVagaId(data.id);
      setCriandoNova(false);
    } catch (err: any) {
      setErro(err.message ?? 'Erro ao criar vaga');
    } finally {
      setGerando(false);
    }
  }

  async function iniciarTeste() {
    if (!vagaId || !usuario) return;
    setErro('');
    setIniciando(true);
    try {
      // Sufixo único por execução: cada "Iniciar teste" vira uma candidatura nova e independente
      // (nunca esbarra no bloqueio de "e-mail já concluiu essa vaga"), mantendo o prefixo teste+
      // que separa esses cards dos candidatos reais em /candidatos e nos relatórios.
      const execucao = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const res = await fetch('/candidaturas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vagaId,
          nome: `[TESTE] ${usuario.nome} (${new Date().toLocaleDateString('pt-BR')})`,
          email: `teste+${execucao}+${usuario.email}`
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao iniciar teste');

      localStorage.setItem(`v4-interview:candidatura:${vagaId}`, data.id);
      router.push(`/entrevista/${vagaId}?teste=1`);
    } catch (err: any) {
      setErro(err.message ?? 'Erro ao iniciar teste');
      setIniciando(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">🧪 Testar entrevista</h1>
        <p className="text-fg/40 text-sm mt-1">
          Escolha uma vaga (ou crie uma de teste), faça a entrevista você mesmo e veja exatamente o
          feedback que a IA geraria pra um candidato real — útil pra validar se as perguntas e a
          calibragem estão fazendo sentido antes de publicar.
        </p>
      </div>

      <div className="rounded-2xl border border-v4border bg-v4surface p-5 shadow-card space-y-4">
        {loading ? (
          <p className="text-fg/50 text-sm">Carregando vagas…</p>
        ) : (
          <>
            <div>
              <label className="block text-sm text-fg/60 mb-1.5">Vaga</label>
              {vagas.length === 0 ? (
                <p className="text-fg/40 text-sm">Nenhuma vaga cadastrada ainda.</p>
              ) : (
                <select
                  value={vagaId}
                  onChange={(e) => setVagaId(e.target.value)}
                  className="w-full rounded-xl bg-field/30 border border-fg/10 px-3 py-2.5 text-sm outline-none focus:border-v4red"
                >
                  {vagas.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.cargo} · {v.senioridade}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {erro && <p className="text-v4red text-sm">{erro}</p>}

            <div className="flex items-center gap-2">
              <button
                onClick={iniciarTeste}
                disabled={!vagaId || iniciando}
                className="rounded-full bg-v4red hover:bg-v4redDark disabled:opacity-50 text-fg font-semibold px-5 py-2.5 text-sm transition"
              >
                {iniciando ? 'Iniciando…' : '▶ Iniciar teste com esta vaga'}
              </button>
              <button
                onClick={() => setCriandoNova((v) => !v)}
                className="rounded-full border border-fg/10 text-fg/60 hover:text-fg hover:border-fg/30 px-4 py-2.5 text-sm transition"
              >
                {criandoNova ? 'Cancelar' : '+ Nova vaga de teste'}
              </button>
            </div>
          </>
        )}

        {criandoNova && (
          <form onSubmit={criarVagaDeTeste} className="border-t border-v4border pt-4 space-y-3 v4-fade-in">
            <div>
              <label className="block text-xs text-fg/50 mb-1">Cargo</label>
              <input
                required
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                placeholder="Ex: SDR"
                className="w-full rounded-xl bg-field/30 border border-fg/10 px-3 py-2 text-sm outline-none focus:border-v4red"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-fg/50 mb-1">Senioridade</label>
                <select
                  value={senioridade}
                  onChange={(e) => setSenioridade(e.target.value)}
                  className="w-full rounded-xl bg-field/30 border border-fg/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                >
                  <option>Estágio</option>
                  <option>Júnior</option>
                  <option>Pleno</option>
                  <option>Sênior</option>
                  <option>Especialista</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-fg/50 mb-1">Segmento</label>
                <input
                  required
                  value={segmento}
                  onChange={(e) => setSegmento(e.target.value)}
                  placeholder="Ex: Vendas B2B"
                  className="w-full rounded-xl bg-field/30 border border-fg/10 px-3 py-2 text-sm outline-none focus:border-v4red"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={gerando}
              className="rounded-full bg-v4red hover:bg-v4redDark disabled:opacity-50 text-fg font-semibold px-4 py-2 text-sm transition"
            >
              {gerando ? 'Gerando roteiro…' : 'Criar e usar esta vaga'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
