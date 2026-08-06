import { NextRequest, NextResponse } from 'next/server';
import { getVagas, getCandidaturas } from '@/lib/store';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

function paraCsv(linhas: Record<string, string | number>[]): string {
  if (linhas.length === 0) return '';
  const header = Object.keys(linhas[0]);
  const escapar = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const corpo = linhas.map((l) => header.map((h) => escapar(String(l[h]))).join(','));
  return [header.map(escapar).join(','), ...corpo].join('\n');
}

export async function GET(req: NextRequest) {
  const bloqueado = aplicarRateLimit(req, 'dashboard', LIMITES.publicRead);
  if (bloqueado) return bloqueado;

  const vagas = await getVagas();
  const todasCandidaturas = await getCandidaturas();

  const vagasComStats = vagas.map((vaga) => {
    const candidaturas = todasCandidaturas.filter((c) => c.vagaId === vaga.id);
    const concluidas = candidaturas.filter((c) => c.status === 'concluida');
    const scoreMedio = concluidas.length
      ? concluidas.reduce((sum, c) => sum + (c.scoreMedio ?? 0), 0) / concluidas.length
      : null;
    const topCandidato = concluidas
      .slice()
      .sort((a, b) => (b.scoreMedio ?? 0) - (a.scoreMedio ?? 0))[0];

    return {
      id: vaga.id,
      cargo: vaga.cargo,
      senioridade: vaga.senioridade,
      segmento: vaga.segmento,
      createdAt: vaga.createdAt,
      totalCandidatos: candidaturas.length,
      concluidos: concluidas.length,
      emAndamento: candidaturas.length - concluidas.length,
      scoreMedio: scoreMedio !== null ? Math.round(scoreMedio * 10) / 10 : null,
      topCandidato: topCandidato
        ? { nome: topCandidato.nome, scoreMedio: topCandidato.scoreMedio }
        : null
    };
  });

  const totalConcluidos = todasCandidaturas.filter((c) => c.status === 'concluida');
  const scoreMedioGeral = totalConcluidos.length
    ? Math.round(
        (totalConcluidos.reduce((sum, c) => sum + (c.scoreMedio ?? 0), 0) / totalConcluidos.length) * 10
      ) / 10
    : null;

  // Distribuição de notas: 5 faixas, só sobre entrevistas concluídas (têm score).
  const FAIXAS = ['0-2', '2-4', '4-6', '6-8', '8-10'];
  const distribuicaoNotas = FAIXAS.map((faixa) => {
    const [min, max] = faixa.split('-').map(Number);
    const total = totalConcluidos.filter((c) => {
      const s = c.scoreMedio ?? 0;
      return max === 10 ? s >= min && s <= max : s >= min && s < max;
    }).length;
    return { faixa, total };
  });

  // Funil: reaproveita a cor semântica das fases (neutro/atencao = pendente, sucesso = aprovado, perigo = rejeitado).
  const vagaPorId = new Map(vagas.map((v) => [v.id, v]));
  let pendentes = 0;
  let aprovados = 0;
  let rejeitados = 0;
  for (const c of todasCandidaturas) {
    const cor = vagaPorId.get(c.vagaId)?.fases.find((f) => f.id === c.fase)?.cor ?? 'neutro';
    if (cor === 'sucesso') aprovados++;
    else if (cor === 'perigo') rejeitados++;
    else pendentes++;
  }
  const funil = { pendentes, aprovados, rejeitados, total: todasCandidaturas.length };

  if (req.nextUrl.searchParams.get('formato') === 'csv') {
    const csv =
      '﻿' +
      paraCsv(
        vagasComStats.map((v) => ({
          Vaga: v.cargo,
          Senioridade: v.senioridade,
          Segmento: v.segmento,
          'Total candidatos': v.totalCandidatos,
          Concluídos: v.concluidos,
          'Em andamento': v.emAndamento,
          'Score médio': v.scoreMedio ?? '',
          'Criada em': new Date(v.createdAt).toLocaleString('pt-BR')
        }))
      );
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="relatorio-vagas.csv"'
      }
    });
  }

  return NextResponse.json({
    totais: {
      vagas: vagas.length,
      candidatos: todasCandidaturas.length,
      concluidos: totalConcluidos.length,
      scoreMedioGeral
    },
    vagas: vagasComStats,
    distribuicaoNotas,
    funil
  });
}
