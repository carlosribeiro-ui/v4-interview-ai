import { NextRequest, NextResponse } from 'next/server';
import { getCandidaturas, getVagas } from '@/lib/store';

export const dynamic = 'force-dynamic';

export type CandidatoEnriquecido = {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  status: 'em_andamento' | 'concluida';
  fase: string;
  scoreMedio: number | null;
  createdAt: string;
  vagaId: string;
  vagaCargo: string;
  vagaSenioridade: string;
  /** true = criado via "Testar entrevista" (email teste+...) — card de validação, não um candidato real. */
  teste: boolean;
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
      scoreMedio: c.scoreMedio,
      createdAt: c.createdAt,
      vagaId: c.vagaId,
      vagaCargo: vaga?.cargo ?? '—',
      vagaSenioridade: vaga?.senioridade ?? '—',
      teste: c.email.trim().toLowerCase().startsWith('teste+')
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
