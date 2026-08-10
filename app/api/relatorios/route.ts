import { NextRequest, NextResponse } from 'next/server';
import { getVagas, getCandidaturas } from '@/lib/store';
import { listarUsuarios, lerSessao } from '@/lib/auth';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // V-SEC: Auth check — relatórios expõem dados sensíveis (nomes, emails, scores, CSV completo)
  const sessao = await lerSessao(req);
  if (!sessao || (sessao.role !== 'admin' && sessao.role !== 'talent')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const bloqueado = await aplicarRateLimit(req, 'relatorios', LIMITES.admin);
  if (bloqueado) return bloqueado;

  const params = req.nextUrl.searchParams;
  const vagaFiltro = params.get('vagaId');
  const scoreMin = params.get('scoreMin') ? Number(params.get('scoreMin')) : null;
  const scoreMax = params.get('scoreMax') ? Number(params.get('scoreMax')) : null;
  const periodo = params.get('periodo') || 'mes';

  const vagas = await getVagas();
  const todasCandidaturas = await getCandidaturas();
  const usuarios = await listarUsuarios();

  let candidaturas = todasCandidaturas;
  if (vagaFiltro) candidaturas = candidaturas.filter((c) => c.vagaId === vagaFiltro);
  if (scoreMin !== null) candidaturas = candidaturas.filter((c) => (c.scoreMedio ?? -1) >= scoreMin);
  if (scoreMax !== null) candidaturas = candidaturas.filter((c) => (c.scoreMedio ?? 99) <= scoreMax);

  const vagaPorId = new Map(vagas.map((v) => [v.id, v]));
  const talents = usuarios.filter((u: { role: string }) => u.role === 'talent');

  const concluidas = candidaturas.filter((c) => c.status === 'concluida');
  const scoreMedioGeral = concluidas.length
    ? Math.round((concluidas.reduce((sum, c) => sum + (c.scoreMedio ?? 0), 0) / concluidas.length) * 10) / 10
    : null;

  // Funil
  let pendentes = 0, aprovados = 0, rejeitados = 0;
  for (const c of candidaturas) {
    const cor = vagaPorId.get(c.vagaId)?.fases.find((f) => f.id === c.fase)?.cor ?? 'neutro';
    if (cor === 'sucesso') aprovados++;
    else if (cor === 'perigo') rejeitados++;
    else pendentes++;
  }

  // Distribuição
  const FAIXAS = ['0-2', '2-4', '4-6', '6-8', '8-10'];
  const distribuicaoNotas = FAIXAS.map((faixa) => {
    const [min, max] = faixa.split('-').map(Number);
    return { faixa, total: concluidas.filter((c) => { const s = c.scoreMedio ?? 0; return max === 10 ? s >= min && s <= max : s >= min && s < max; }).length };
  });

  // Timeline
  function chavePeriodo(dataStr: string): string {
    const d = new Date(dataStr);
    if (periodo === 'semana') { const i = new Date(d); i.setDate(d.getDate() - d.getDay()); return i.toISOString().slice(0, 10); }
    if (periodo === 'trimestre') return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const timelineMap = new Map<string, { total: number; concluidos: number }>();
  for (const c of candidaturas) {
    const ch = chavePeriodo(c.createdAt);
    const e = timelineMap.get(ch) ?? { total: 0, concluidos: 0 };
    e.total++;
    if (c.status === 'concluida') e.concluidos++;
    timelineMap.set(ch, e);
  }
  const timeline = Array.from(timelineMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([periodo, dados]) => ({ periodo, ...dados }));

  // Score por senioridade
  const scorePorSenioridade = vagas.map((v) => {
    const cs = concluidas.filter((c) => c.vagaId === v.id);
    return { cargo: v.cargo, senioridade: v.senioridade, scoreMedio: cs.length ? Math.round((cs.reduce((s, c) => s + (c.scoreMedio ?? 0), 0) / cs.length) * 10) / 10 : null, total: cs.length };
  }).filter((v) => v.total > 0);

  // Stats por vaga
  const vagasComStats = vagas.map((v) => {
    const cs = candidaturas.filter((c) => c.vagaId === v.id);
    const conc = cs.filter((c) => c.status === 'concluida');
    return { id: v.id, cargo: v.cargo, senioridade: v.senioridade, total: cs.length, concluidos: conc.length, emAndamento: cs.length - conc.length, scoreMedio: conc.length ? Math.round((conc.reduce((s, c) => s + (c.scoreMedio ?? 0), 0) / conc.length) * 10) / 10 : null };
  }).filter((v) => vagaFiltro ? v.id === vagaFiltro : true);

  // Talent stats
  const talentStats = talents.map((t) => {
    const cs = candidaturas.filter((c) => c.talentResponsavel === t.email);
    const conc = cs.filter((c) => c.status === 'concluida');
    const ap = cs.filter((c) => { const cor = vagaPorId.get(c.vagaId)?.fases.find((f) => f.id === c.fase)?.cor ?? 'neutro'; return cor === 'sucesso'; });
    const sm = conc.length ? Math.round((conc.reduce((s, c) => s + (c.scoreMedio ?? 0), 0) / conc.length) * 10) / 10 : null;
    return { nome: t.nome, email: t.email, total: cs.length, concluidos: conc.length, aprovados: ap.length, scoreMedio: sm, taxaConversao: conc.length ? Math.round((ap.length / conc.length) * 100) : 0 };
  }).filter((t: { total: number }) => t.total > 0).sort((a: { total: number }, b: { total: number }) => b.total - a.total);

  // Top candidatos
  const topCandidatos = concluidas.slice().sort((a, b) => (b.scoreMedio ?? 0) - (a.scoreMedio ?? 0)).slice(0, 50).map((c) => ({
    nome: c.nome, email: c.email, scoreMedio: c.scoreMedio, vaga: vagaPorId.get(c.vagaId)?.cargo ?? '—',
    fase: vagaPorId.get(c.vagaId)?.fases.find((f) => f.id === c.fase)?.nome ?? c.fase, talent: c.talentResponsavel ?? '—'
  }));

  // CSV
  if (params.get('formato') === 'csv') {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = ['Nome', 'Email', 'Vaga', 'Senioridade', 'Status', 'Fase', 'Score', 'Talent', 'Criado em'];
    const corpo = topCandidatos.map((c) => [c.nome, c.email, c.vaga, '', '', c.fase, c.scoreMedio?.toFixed(1) ?? '', c.talent, ''].map(esc).join(','));
    return new NextResponse('﻿' + [header.map(esc).join(','), ...corpo].join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="relatorios.csv"' } });
  }

  return NextResponse.json({ totais: { vagas: vagas.length, candidatos: candidaturas.length, concluidos: concluidas.length, scoreMedioGeral }, vagas: vagasComStats, distribuicaoNotas, funil: { pendentes, aprovados, rejeitados, total: candidaturas.length }, timeline, scorePorSenioridade, topCandidatos, talentStats });
}
