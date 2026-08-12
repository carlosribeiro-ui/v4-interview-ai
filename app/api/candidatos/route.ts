import { NextRequest, NextResponse } from 'next/server';
import { getCandidaturas, getVagas } from '@/lib/store';
import { lerSessao } from '@/lib/auth';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export type CandidatoEnriquecido = {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  status: 'em_andamento' | 'concluida';
  fase: string;
  faseId: string;
  scoreMedio: number | null;
  createdAt: string;
  vagaId: string;
  vagaCargo: string;
  vagaSenioridade: string;
  teste: boolean;
  talentResponsavel?: string;
  segmento?: string;
  nivelProfissional?: string;
  formacao?: string;
  pais?: string;
  estado?: string;
  cidade?: string;
  idioma?: string;
};

function paraCsv(linhas: CandidatoEnriquecido[]): string {
  const header = ['Nome', 'Email', 'Telefone', 'Vaga', 'Senioridade', 'Status', 'Fase', 'Score médio', 'Criado em'];
  const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const corpo = linhas.map((c) =>
    [
      c.nome,
      c.email,
      c.telefone ?? '',
      c.vagaCargo,
      c.vagaSenioridade,
      c.status === 'concluida' ? 'Concluída' : 'Em andamento',
      c.fase,
      c.scoreMedio !== null ? c.scoreMedio.toFixed(1) : '',
      new Date(c.createdAt).toLocaleString('pt-BR')
    ]
      .map((v) => escapar(String(v)))
      .join(',')
  );
  return [header.map(escapar).join(','), ...corpo].join('\n');
}

export async function GET(req: NextRequest) {
  // Auth: apenas admin/talent pode ver o kanban global de candidatos
  const sessao = await lerSessao(req);
  if (!sessao || (sessao.role !== 'admin' && sessao.role !== 'talent')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // V-SEC: Rate limit em endpoint de leitura em massa
  const bloqueado = await aplicarRateLimit(req, 'candidatos-list', LIMITES.admin, sessao.email);
  if (bloqueado) return bloqueado;

  const params = req.nextUrl.searchParams;
  const status = params.get('status'); // 'concluida' | 'em_andamento' | null
  const q = params.get('q')?.trim().toLowerCase();
  const vagaId = params.get('vagaId');
  const scoreMin = params.get('scoreMin') ? Number(params.get('scoreMin')) : null;
  const scoreMax = params.get('scoreMax') ? Number(params.get('scoreMax')) : null;
  const formato = params.get('formato');
  const incluirTestes = params.get('incluirTestes') === '1';

  const vagas = await getVagas();
  const vagaPorId = new Map(vagas.map((v) => [v.id, v]));

  const todasCandidaturas = await getCandidaturas();
  let candidatos: CandidatoEnriquecido[] = todasCandidaturas.map((c) => {
    const vaga = vagaPorId.get(c.vagaId);
    return {
      id: c.id,
      nome: c.nome,
      email: c.email,
      telefone: c.telefone,
      status: c.status,
      fase: vaga?.fases.find((f) => f.id === c.fase)?.nome ?? c.fase,
      faseId: c.fase,
      scoreMedio: c.scoreMedio,
      createdAt: c.createdAt,
      vagaId: c.vagaId,
      vagaCargo: vaga?.cargo ?? '—',
      vagaSenioridade: vaga?.senioridade ?? '—',
      teste: c.email.trim().toLowerCase().startsWith('teste+'),
      talentResponsavel: c.talentResponsavel,
      segmento: c.segmento,
      nivelProfissional: c.nivelProfissional,
      formacao: c.formacao,
      pais: c.pais,
      estado: c.estado,
      cidade: c.cidade,
      idioma: c.idioma
    };
  });

  if (!incluirTestes) candidatos = candidatos.filter((c) => !c.teste);
  if (status) candidatos = candidatos.filter((c) => c.status === status);
  if (vagaId) candidatos = candidatos.filter((c) => c.vagaId === vagaId);
  if (q) {
    candidatos = candidatos.filter(
      (c) => c.nome.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  }
  if (scoreMin !== null) candidatos = candidatos.filter((c) => (c.scoreMedio ?? -1) >= scoreMin);
  if (scoreMax !== null) candidatos = candidatos.filter((c) => (c.scoreMedio ?? 99) <= scoreMax);
  // Filtros avançados
  const seg = params.get('segmento');
  const niv = params.get('nivelProfissional');
  const form = params.get('formacao');
  const pai = params.get('pais');
  const est = params.get('estado');
  const cid = params.get('cidade');
  const idi = params.get('idioma');
  if (seg) candidatos = candidatos.filter((c) => c.segmento === seg);
  if (niv) candidatos = candidatos.filter((c) => c.nivelProfissional === niv);
  if (form) candidatos = candidatos.filter((c) => c.formacao === form);
  if (pai) candidatos = candidatos.filter((c) => c.pais === pai);
  if (est) candidatos = candidatos.filter((c) => c.estado === est);
  if (cid) candidatos = candidatos.filter((c) => c.cidade === cid);
  if (idi) candidatos = candidatos.filter((c) => c.idioma === idi);

  candidatos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (formato === 'csv') {
    const csv = '﻿' + paraCsv(candidatos); // BOM p/ Excel abrir acentos certo
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="candidatos.csv"'
      }
    });
  }

  return NextResponse.json({ candidatos, vagas: vagas.map((v) => ({ id: v.id, cargo: v.cargo })) });
}
