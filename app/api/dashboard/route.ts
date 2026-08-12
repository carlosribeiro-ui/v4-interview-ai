import { NextRequest, NextResponse } from 'next/server';
import { getVagas, getCandidaturas } from '@/lib/store';
import { listarUsuarios, lerSessao } from '@/lib/auth';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';
import { gerarTabelaPdfBuffer } from '@/lib/tabela-pdf';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // V-SEC: Auth check — dashboard expõe dados sensíveis (nomes, emails, scores, métricas por recrutador)
  const sessao = await lerSessao(req);
  if (!sessao || (sessao.role !== 'admin' && sessao.role !== 'talent')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const bloqueado = await aplicarRateLimit(req, 'dashboard', LIMITES.admin, sessao.email);
  if (bloqueado) return bloqueado;

  const params = req.nextUrl.searchParams;
  const vagaFiltro = params.get('vagaId');

  const vagas = await getVagas();
  const todasCandidaturas = await getCandidaturas();
  const usuarios = await listarUsuarios();

  let candidaturas = todasCandidaturas;
  if (vagaFiltro) candidaturas = candidaturas.filter((c) => c.vagaId === vagaFiltro);

  const vagaPorId = new Map(vagas.map((v) => [v.id, v]));
  const talents = usuarios.filter((u: { role: string }) => u.role === 'talent');

  // ─── Totais ───
  const concluidas = candidaturas.filter((c) => c.status === 'concluida');
  const scoreMedioGeral = concluidas.length
    ? Math.round((concluidas.reduce((sum, c) => sum + (c.scoreMedio ?? 0), 0) / concluidas.length) * 10) / 10
    : null;

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

  // ─── Métricas por talent ───
  const porTalent = talents.map((t) => {
    const cs = candidaturas.filter((c) => c.talentResponsavel === t.email);
    const conc = cs.filter((c) => c.status === 'concluida');
    const aprov = cs.filter((c) => {
      const cor = vagaPorId.get(c.vagaId)?.fases.find((f) => f.id === c.fase)?.cor ?? 'neutro';
      return cor === 'sucesso';
    });
    const scoreMedio = conc.length
      ? Math.round((conc.reduce((sum, c) => sum + (c.scoreMedio ?? 0), 0) / conc.length) * 10) / 10
      : null;
    return {
      nome: t.nome,
      email: t.email,
      total: cs.length,
      concluidos: conc.length,
      aprovados: aprov.length,
      scoreMedio,
      taxaConversao: conc.length ? Math.round((aprov.length / conc.length) * 100) : 0
    };
  }).filter((t: { total: number }) => t.total > 0).sort((a: { total: number }, b: { total: number }) => b.total - a.total);

  // ─── Candidatos sem talent atribuído ───
  const semTalent = candidaturas.filter((c) => !c.talentResponsavel).length;

  // ─── Top candidatos ───
  const topCandidatos = concluidas
    .slice()
    .sort((a, b) => (b.scoreMedio ?? 0) - (a.scoreMedio ?? 0))
    .slice(0, 10)
    .map((c) => ({
      nome: c.nome,
      scoreMedio: c.scoreMedio,
      vaga: vagaPorId.get(c.vagaId)?.cargo ?? '—',
      talent: c.talentResponsavel ?? '—'
    }));

  // ─── Stats por vaga ───
  const vagasComStats = vagas.map((vaga) => {
    const cs = candidaturas.filter((c) => c.vagaId === vaga.id);
    const conc = cs.filter((c) => c.status === 'concluida');
    const scoreMedio = conc.length
      ? Math.round((conc.reduce((sum, c) => sum + (c.scoreMedio ?? 0), 0) / conc.length) * 10) / 10
      : null;
    return {
      id: vaga.id, cargo: vaga.cargo, senioridade: vaga.senioridade,
      total: cs.length, concluidos: conc.length, emAndamento: cs.length - conc.length, scoreMedio
    };
  }).filter((v) => vagaFiltro ? v.id === vagaFiltro : true);

  // ─── Últimas atividades (últimas 10 candidaturas criadas) ───
  const ultimasAtividades = candidaturas
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10)
    .map((c) => ({
      nome: c.nome,
      vaga: vagaPorId.get(c.vagaId)?.cargo ?? '—',
      status: c.status,
      scoreMedio: c.scoreMedio,
      talent: c.talentResponsavel ?? '—',
      criadoEm: c.createdAt
    }));

  // ─── Precisa de atenção ───
  const agora = new Date();
  const UM_DIA = 24 * 60 * 60 * 1000;

  // Candidatos com nota alta sem decisão
  const altaNotaSemDecisao = concluidas
    .filter((c) => (c.scoreMedio ?? 0) >= 7 && c.fase !== 'aprovado' && c.fase !== 'reprovado')
    .slice(0, 5)
    .map((c) => ({ id: c.id, nome: c.nome, score: c.scoreMedio, vaga: vagaPorId.get(c.vagaId)?.cargo ?? '—', motivo: 'Nota alta sem decisão' }));

  // Entrevistas finalizadas há mais de 3 dias sem parecer
  const semParecer = concluidas
    .filter((c) => !c.parecer && (agora.getTime() - new Date(c.createdAt).getTime()) > 3 * UM_DIA)
    .slice(0, 5)
    .map((c) => ({ id: c.id, nome: c.nome, score: c.scoreMedio, vaga: vagaPorId.get(c.vagaId)?.cargo ?? '—', motivo: 'Concluída há 3+ dias sem parecer' }));

  // Vagas sem candidatos na última semana
  const umaSemanaAtras = new Date(agora.getTime() - 7 * UM_DIA);
  const vagasSemCandidatos = vagas
    .filter((v) => {
      const cs = candidaturas.filter((c) => c.vagaId === v.id);
      return cs.length === 0 || cs.every((c) => new Date(c.createdAt) < umaSemanaAtras);
    })
    .slice(0, 5)
    .map((v) => ({ id: v.id, nome: v.cargo, motivo: 'Sem candidatos novos na semana' }));

  const precisaAtencao = [...altaNotaSemDecisao, ...semParecer, ...vagasSemCandidatos];

  // Export (CSV/PDF) — tabela de vagas com as mesmas métricas mostradas no dashboard
  const formato = params.get('formato');
  if (formato === 'csv' || formato === 'pdf') {
    const colunas = [
      { chave: 'cargo', titulo: 'Vaga' },
      { chave: 'senioridade', titulo: 'Senioridade' },
      { chave: 'total', titulo: 'Total' },
      { chave: 'concluidos', titulo: 'Concluídos' },
      { chave: 'emAndamento', titulo: 'Em andamento' },
      { chave: 'scoreMedio', titulo: 'Score médio' }
    ];
    const linhas = vagasComStats.map((v) => ({
      cargo: v.cargo,
      senioridade: v.senioridade,
      total: String(v.total),
      concluidos: String(v.concluidos),
      emAndamento: String(v.emAndamento),
      scoreMedio: v.scoreMedio !== null ? v.scoreMedio.toFixed(1) : '—'
    }));
    const subtitulo = `${vagas.length} vaga(s) · ${candidaturas.length} candidato(s) · Score médio geral: ${scoreMedioGeral ?? '—'} · Gerado em ${new Date().toLocaleString('pt-BR')}`;

    if (formato === 'csv') {
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const corpo = linhas.map((l) => colunas.map((c) => esc(l[c.chave as keyof typeof l])).join(','));
      return new NextResponse('﻿' + [colunas.map((c) => esc(c.titulo)).join(','), ...corpo].join('\n'), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="dashboard.csv"' }
      });
    }

    const buffer = await gerarTabelaPdfBuffer({ titulo: 'Dashboard — vagas', subtitulo, colunas, linhas });
    return new NextResponse(new Uint8Array(buffer), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="dashboard.pdf"' }
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
      scoreMedioGeral,
      semTalent
    },
    funil: { pendentes, aprovados, rejeitados, total: candidaturas.length },
    distribuicaoNotas,
    porTalent,
    topCandidatos,
    vagas: vagasComStats,
    ultimasAtividades,
    precisaAtencao
  });
}
