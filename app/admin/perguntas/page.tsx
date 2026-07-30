'use client';

import { useState } from 'react';

type AnaliseItem = {
  indice: number;
  notaTexto: number;
  notaCriterios: number;
  feedbackTexto: string;
  feedbackCriterios: string;
  sugestaoMelhoria: string | null;
};

function corNota(n: number) {
  if (n >= 8) return 'text-v4green';
  if (n >= 5) return 'text-v4yellow';
  return 'text-v4red';
}

function bgNota(n: number) {
  if (n >= 8) return 'bg-v4green/10 border-v4green/30';
  if (n >= 5) return 'bg-v4yellow/10 border-v4yellow/30';
  return 'bg-v4red/10 border-v4red/30';
}

export default function AdminAnalisarPerguntas() {
  const [cargo, setCargo] = useState('');
  const [senioridade, setSenioridade] = useState('');
  const [segmento, setSegmento] = useState('');
  const [perguntasRaw, setPerguntasRaw] = useState('');
  const [analise, setAnalise] = useState<AnaliseItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [modoEntrada, setModoEntrada] = useState<'manual' | 'vaga'>('manual');

  async function analisar() {
    setErro(null);
    setAnalise(null);

    let perguntas: { texto: string; criterios: string }[];

    if (modoEntrada === 'manual') {
      try {
        perguntas = JSON.parse(perguntasRaw);
        if (!Array.isArray(perguntas) || perguntas.length === 0)
          throw new Error('Array vazio');
      } catch {
        setErro('JSON inválido. Use o formato: [{ "texto": "...", "criterios": "..." }]');
        return;
      }
    } else {
      try {
        const vaga = JSON.parse(perguntasRaw);
        perguntas = (vaga.perguntas ?? vaga).map((p: any) => ({
          texto: p.texto ?? p.pergunta ?? '',
          criterios: p.criterios ?? p.criterio ?? ''
        }));
      } catch {
        setErro('JSON inválido. Cole o JSON da vaga ou array de perguntas.');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch('/api/analisar-perguntas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perguntas, cargo, senioridade, segmento })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAnalise(data.analise);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <a href="/" className="text-sm text-white/40 hover:text-white/70">← Dashboard</a>
        <h1 className="font-heading text-xl font-bold mt-1">Analisar perguntas</h1>
        <p className="text-white/50 text-sm mt-1">
          Cole as perguntas e a IA avalia clareza do texto e qualidade dos critérios.
        </p>
      </div>

      <section className="bg-white/5 border border-white/10 rounded p-6 space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-white/60 mb-1">Cargo (opcional)</label>
            <input value={cargo} onChange={(e) => setCargo(e.target.value)}
              placeholder="Ex: Desenvolvedor Backend"
              className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 outline-none focus:border-v4red" />
          </div>
          <div>
            <label className="block text-sm text-white/60 mb-1">Senioridade (opcional)</label>
            <select value={senioridade} onChange={(e) => setSenioridade(e.target.value)}
              className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 outline-none focus:border-v4red">
              <option value="">—</option>
              <option>Estágio</option><option>Júnior</option>
              <option>Pleno</option><option>Sênior</option><option>Especialista</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-white/60 mb-1">Segmento (opcional)</label>
            <input value={segmento} onChange={(e) => setSegmento(e.target.value)}
              placeholder="Ex: RH Tech"
              className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 outline-none focus:border-v4red" />
          </div>
        </div>

        <div className="flex gap-2">
          {(['manual', 'vaga'] as const).map((modo) => (
            <button key={modo} onClick={() => { setModoEntrada(modo); setPerguntasRaw(''); setAnalise(null); setErro(null); }}
              className={`px-3 py-1.5 rounded border text-sm transition ${
                modoEntrada === modo
                  ? 'bg-v4red text-white border-v4red font-medium'
                  : 'border-white/10 text-white/60 hover:bg-white/5'
              }`}>
              {modo === 'manual' ? 'Inserir perguntas' : 'JSON da vaga'}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-sm text-white/60 mb-1">
            {modoEntrada === 'manual'
              ? 'Array de perguntas (JSON)'
              : 'JSON da vaga (objeto completo ou array de perguntas)'}
          </label>
          <textarea value={perguntasRaw} onChange={(e) => setPerguntasRaw(e.target.value)}
            placeholder={modoEntrada === 'manual'
              ? '[{ "texto": "Pergunta...", "criterios": "O que avaliar..." }]'
              : 'Cole aqui o JSON exportado da vaga'}
            rows={8}
            className="w-full rounded bg-black/30 border border-white/10 px-3 py-2 outline-none focus:border-v4red text-sm font-mono" />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={analisar} disabled={loading || !perguntasRaw.trim()}
            className="rounded bg-v4red hover:bg-v4redDark disabled:opacity-50 text-white uppercase font-bold px-4 py-2 transition">
            {loading ? 'Analisando com IA (Gemini Flash)…' : 'Analisar perguntas'}
          </button>
          {erro && <span className="text-v4red text-sm">{erro}</span>}
        </div>
      </section>

      {analise && (
        <section className="space-y-4">
          <h2 className="font-heading text-lg font-semibold">Resultado da análise</h2>
          {analise.map((item) => (
            <div key={item.indice} className={`rounded border p-5 ${bgNota(Math.min(item.notaTexto, item.notaCriterios))}`}>
              <div className="flex items-start justify-between mb-3">
                <span className="text-sm font-medium text-white/60">Pergunta #{item.indice}</span>
                <div className="flex gap-4 text-sm">
                  <span>Texto: <span className={`font-semibold ${corNota(item.notaTexto)}`}>{item.notaTexto.toFixed(1)}</span></span>
                  <span>Critérios: <span className={`font-semibold ${corNota(item.notaCriterios)}`}>{item.notaCriterios.toFixed(1)}</span></span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-white/40 mb-1">📝 Feedback do texto</p>
                  <p className="text-white/80">{item.feedbackTexto}</p>
                </div>
                <div>
                  <p className="text-white/40 mb-1">🎯 Feedback dos critérios</p>
                  <p className="text-white/80">{item.feedbackCriterios}</p>
                </div>
              </div>

              {item.sugestaoMelhoria && (
                <div className="mt-3 bg-v4green/10 border border-v4green/30 rounded px-4 py-2 text-sm">
                  <span className="text-v4green font-medium">💡 Sugestão: </span>
                  <span className="text-white/80">{item.sugestaoMelhoria}</span>
                </div>
              )}
            </div>
          ))}

          <div className="bg-white/5 border border-white/10 rounded p-4 text-sm">
            <p className="text-white/50">
              Médias:Texto{' '}
              <span className="font-semibold text-white/80">
                {(analise.reduce((s, i) => s + i.notaTexto, 0) / analise.length).toFixed(1)}
              </span>
              {' · '}Critérios{' '}
              <span className="font-semibold text-white/80">
                {(analise.reduce((s, i) => s + i.notaCriterios, 0) / analise.length).toFixed(1)}
              </span>
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
