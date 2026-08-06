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

  const params = req.nextUrl.searchParams;
  const vagaFiltro = params.get('vagaId');
  const scoreMin = params.get('scoreMin') ? Number(params.get('scoreMin')) : null;
  const scoreMax = params.get('scoreMax') ? Number(params.get('scoreMax')) : null;
  const statusFiltro = params.get('status');
  const periodo = params.get('periodo') || 'mes'; // 'semana' | 'mes' | 'trimestre'

  const vagas = await getVagas();
  const todasCandidaturas = await getCandidaturas();

  // Aplica filtros
  let candidaturas = todasCandidaturas;
  if (vagaFiltro) candidaturas = candidaturas.filter((c) => c.vagaId === vagaFiltro);
  if (statusFiltro) candidaturas = candidaturas.filter((c) => c.status === statusFiltro);
  if (scoreMin !== null) candidaturas = candidaturas.filter((c) => (c.scoreMedio ?? -1) >= scoreMin);
  if (scoreMax !== null) candidaturas = candidaturas.filter((c) => (c.scoreMedio ?? 99) <= scoreMax);

  const vagaPorId = new Map(vagas.map((v) => [v.id, v]));

  // ─── Totais ───
  const concluidas = candidaturas.filter((c) => c.status === 'concluida');
  const scoreMedioGeral = concluidas.length
    ? Math.round((concluidas.reduce((sum, c) => sum + (c.scoreMedio ?? 0), 0) / concluidas.length) * 10) / 10
    : null;

  // ─── Stats por vaga ───
  const vagasComStats = vagas.map((vaga) => {
    const cs = candidaturas.filter((c) => c.vagaId === vaga.id);
    const conc = cs.filter((c) => c.status === 'concluida');
    const scoreMedio = conc.length
      ? Math.round((conc.reduce((sum, c) => sum + (c.scoreMedio ?? 0), 0) / conc.length) * 10) / 10
      : null;
    return {
      id: vaga.id,
      cargo: vaga.cargo,
      senioridade: vaga.senioridade,
      total: cs.length,
      concluidos: conc.length,
      emAndamento: cs.length - conc.length,
      scoreMedio
    };
  }).filter((v) => vagaFiltro ? v.id === vagaFiltro : true);

  // ─── Distribuição de notas ───
  const FAIXAS = ['0-2', '2-4', '4-6', '6-8', '8-10'];
  const distribuicaoNotas = FAIXAS.map((faixa) => {
    const [min, max] = faixa.split('-').map(Number);
    const total = concluidas.filter((c) => {
      const s = c.scoreMedio ?? 0;
      return max === 10 ? s >= min && s <= max : s >= min && s < max;
    }).length;
    return { faixa, total };
  });

  // ─── Funil ───
  let pendentes = 0;
  let aprovados = 0;
  let rejeitados = 0;
  for (const c of candidaturas) {
    const cor = vagaPorId.get(c.vagaId)?.fases.find((f) => f.id === c.fase)?.cor ?? 'neutro';
    if (cor === 'sucesso') aprovados++;
    else if (cor === 'perigo') rejeitados++;
    else pendentes++;
  }

  // ─── Timeline (candidatos por período) ───
  function chavePeriodo(dataStr: string): string {
    const d = new Date(dataStr);
    if (periodo === 'semana') {
      const inicio = new Date(d);
      inicio.setDate(d.getDate() - d.getDay());
      return inicio.toISOString().slice(0, 10);
    }
    if (periodo === 'trimestre') {
      const q = Math.floor(d.getMonth() / 3) + 1;
      return `${d.getFullYear()}-Q${q}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  const timelineMap = new Map<string, { total: number; concluidos: number }>();
  for (const c of candidaturas) {
    const chave = chavePeriodo(c.createdAt);
    const entry = timelineMap.get(chave) ?? { total: 0, concluidos: 0 };
    entry.total++;
    if (c.status === 'concluida') entry.concluidos++;
    timelineMap.set(chave, entry);
  }
  const timeline = Array.from(timelineMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, dados]) => ({ periodo, ...dados }));

  // ─── Score por faixa de senioridade ───
  const scorePorSenioridade = vagas.map((v) => {
    const cs = concluidas.filter((c) => c.vagaId === v.id);
    return {
      cargo: v.cargo,
      senioridade: v.senioridade,
      scoreMedio: cs.length
        ? Math.round((cs.reduce((sum, c) => sum + (c.scoreMedio ?? 0), 0) / cs.length) * 10) / 10
        : null,
      total: cs.length
    };
  }).filter((v) => v.total > 0);

  // ─── Taxa de conversão por fase ───
  const totalCandidatos = candidaturas.length || 1;
  const taxaConversao = {
    emAndamento: Math.round(((candidaturas.length - concluidas.length) / totalCandidatos) * 100),
    concluidos: Math.round((concluidas.length / totalCandidatos) * 100),
    aprovados: Math.round((aprovados / totalCandidatos) * 100),
    rejeitados: Math.round((rejeitados / totalCandidatos) * 100)
  };

  // ─── Top candidatos ───
  const topCandidatos = concluidas
    .slice()
    .sort((a, b) => (b.scoreMedio ?? 0) - (a.scoreMedio ?? 0))
    .slice(0, 10)
    .map((c) => ({
      nome: c.nome,
      email: c.email,
      scoreMedio: c.scoreMedio,
      vaga: vagaPorId.get(c.vagaId)?.cargo ?? '—',
      fase: vagaPorId.get(c.vagaId)?.fases.find((f) => f.id === c.fase)?.nome ?? c.fase
    }));

  // ─── CSV export ───
  if (params.get('formato') === 'csv') {
    const csv = '﻿' + paraCsv(candidaturas.map((c) => ({
      Nome: c.nome,
      Email: c.email,
      Vaga: vagaPorId.get(c.vagaId)?.cargo ?? '—',
      Senioridade: vagaPorId.get(c.vagaId)?.senioridade ?? '—',
      Status: c.status === 'concluida' ? 'Concluída' : 'Em andamento',
      Fase: vagaPorId.get(c.vagaId)?.fases.find((f) => f.id === c.fase)?.nome ?? c.fase,
      'Score médio': c.scoreMedio !== null ? c.scoreMedio.toFixed(1) : '',
      'Criado em': new Date(c.createdAt).toLocaleString('pt-BR')
    })));
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="dashboard.csv"'
      }
    });
  }

  return NextResponse.json({
    totais: {
      vagas: vagas.length,
      candidatos: candidaturas.length,
      concluidos: concluidas.length,
      emAndamento: candidaturas.length - concluidas.length,
      aprovados,
      rejeitados,
      scoreMedioGeral
    },
    vagas: vagasComStats,
    distribuicaoNotas,
    funil: { pendentes, aprovados, rejeitados, total: candidaturas.length },
    taxaConversao,
    timeline,
    scorePorSenioridade,
    topCandidatos
  });
}
