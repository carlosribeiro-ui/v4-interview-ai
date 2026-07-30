'use client';

import { useEffect, useState } from 'react';
import GraficoBarras from '@/app/components/GraficoBarras';
import GraficoFunil from '@/app/components/GraficoFunil';

type VagaStats = {
  id: string;
  cargo: string;
  senioridade: string;
  segmento: string;
  totalCandidatos: number;
  concluidos: number;
  emAndamento: number;
  scoreMedio: number | null;
};

type DashboardData = {
  totais: { vagas: number; candidatos: number; concluidos: number; scoreMedioGeral: number | null };
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

export default function RelatoriosPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <p className="text-white/50">Carregando…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Relatórios</h1>
          <p className="text-white/40 text-sm mt-0.5">Exporte os dados do funil de seleção completo.</p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/dashboard?formato=csv"
            className="rounded-full bg-v4green/15 text-v4green hover:bg-v4green/25 font-semibold px-4 py-2 text-sm transition"
          >
            ⬇ CSV — resumo por vaga
          </a>
          <a
            href="/api/candidatos?formato=csv"
            className="rounded-full bg-v4green/15 text-v4green hover:bg-v4green/25 font-semibold px-4 py-2 text-sm transition"
          >
            ⬇ CSV — todos os candidatos
          </a>
        </div>
      </div>

      <p className="text-xs text-white/40">
        Parecer individual em PDF (por candidato) fica disponível dentro do perfil de cada um, em{' '}
        <a href="/candidatos" className="text-v4red hover:text-v4redDark">
          Candidatos
        </a>
        .
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-v4border bg-v4surface p-5 shadow-card">
          <h2 className="font-heading font-semibold mb-1">Funil de seleção</h2>
          <p className="text-white/40 text-xs mb-4">Onde os candidatos avançam — e onde param</p>
          <GraficoFunil funil={data.funil} />
        </div>
        <div className="rounded-2xl border border-v4border bg-v4surface p-5 shadow-card">
          <h2 className="font-heading font-semibold mb-1">Distribuição de notas</h2>
          <p className="text-white/40 text-xs mb-4">
            Qualidade dos candidatos · {data.totais.concluidos} entrevista(s) pontuada(s)
          </p>
          <GraficoBarras dados={data.distribuicaoNotas} />
        </div>
      </div>

      <div className="rounded-2xl border border-v4border bg-v4surface shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-v4border">
          <h2 className="font-heading font-semibold">Performance por vaga</h2>
          <p className="text-white/40 text-xs mt-0.5">
            {data.totais.vagas} vaga(s) · {data.totais.candidatos} candidato(s) · score médio geral{' '}
            <span className={corScore(data.totais.scoreMedioGeral)}>
              {data.totais.scoreMedioGeral !== null ? data.totais.scoreMedioGeral.toFixed(1) : '—'}
            </span>
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/40 text-xs uppercase">
                <th className="px-5 py-2.5">Vaga</th>
                <th className="px-5 py-2.5">Candidatos</th>
                <th className="px-5 py-2.5">Concluídos</th>
                <th className="px-5 py-2.5">Em andamento</th>
                <th className="px-5 py-2.5">Score médio</th>
              </tr>
            </thead>
            <tbody>
              {data.vagas.map((v) => (
                <tr key={v.id} className="border-t border-white/[0.05] hover:bg-white/[0.03]">
                  <td className="px-5 py-3">
                    <a href={`/vagas/${v.id}`} className="font-medium hover:text-v4red transition">
                      {v.cargo}
                    </a>
                    <div className="text-xs text-white/40">
                      {v.senioridade} · {v.segmento}
                    </div>
                  </td>
                  <td className="px-5 py-3">{v.totalCandidatos}</td>
                  <td className="px-5 py-3 text-v4green">{v.concluidos}</td>
                  <td className="px-5 py-3 text-v4yellow">{v.emAndamento}</td>
                  <td className={`px-5 py-3 font-semibold ${corScore(v.scoreMedio)}`}>
                    {v.scoreMedio !== null ? v.scoreMedio.toFixed(1) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
