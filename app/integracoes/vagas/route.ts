import { NextRequest, NextResponse } from 'next/server';
import { getVagas, getCandidaturas } from '@/lib/store';
import { criarVaga } from '@/lib/vagas';
import { checarChaveExterna } from '@/lib/auth-externa';

export const dynamic = 'force-dynamic';

/**
 * API para sistemas externos (ex: n8n, Pipefy via automação) criarem e
 * consultarem vagas sem passar pelo painel admin. Autenticada por
 * Authorization: Bearer (ver lib/auth-externa.ts).
 */
export async function GET(req: NextRequest) {
  const authErro = checarChaveExterna(req);
  if (authErro) return authErro;

  const externalId = req.nextUrl.searchParams.get('externalId');
  const ativaParam = req.nextUrl.searchParams.get('ativa');
  const todasVagas = await getVagas();
  const todasCandidaturas = await getCandidaturas();

  const vagas = todasVagas.filter((v) => {
    if (externalId && v.externalId !== externalId) return false;
    if (ativaParam === 'true' && v.ativa === false) return false;
    if (ativaParam === 'false' && v.ativa !== false) return false;
    return true;
  });

  const resultado = vagas.map((vaga) => {
    const candidaturas = todasCandidaturas.filter((c) => c.vagaId === vaga.id);
    const concluidas = candidaturas.filter((c) => c.status === 'concluida');
    const scoreMedio = concluidas.length
      ? concluidas.reduce((sum, c) => sum + (c.scoreMedio ?? 0), 0) / concluidas.length
      : null;

    return {
      id: vaga.id,
      externalId: vaga.externalId ?? null,
      origem: vaga.origem ?? null,
      cargo: vaga.cargo,
      senioridade: vaga.senioridade,
      segmento: vaga.segmento,
      ativa: vaga.ativa !== false,
      requisitos: vaga.requisitos,
      perguntas: vaga.perguntas,
      fases: vaga.fases,
      jobDescription: vaga.jobDescription ?? null,
      createdAt: vaga.createdAt,
      linkCandidato: `/entrevista/${vaga.id}`,
      totalCandidatos: candidaturas.length,
      concluidos: concluidas.length,
      scoreMedio: scoreMedio !== null ? Math.round(scoreMedio * 10) / 10 : null
    };
  });

  return NextResponse.json(resultado);
}

/**
 * Cria a vaga replicando exatamente o que o front permite configurar: se `perguntas` e
 * `requisitos` vierem prontos, usa direto (sem IA) — pra quem quer integrar o processo
 * inteiro via API. Se vierem vazios, gera automaticamente a partir de jobDescription,
 * como já fazia.
 */
export async function POST(req: NextRequest) {
  const authErro = checarChaveExterna(req);
  if (authErro) return authErro;

  const body = await req.json();
  const { cargo, senioridade, segmento, jobDescription, externalId, origem, requisitos, perguntas, fases, ativa } =
    body ?? {};

  if (!cargo || !senioridade || !segmento) {
    return NextResponse.json(
      { error: 'cargo, senioridade e segmento são obrigatórios' },
      { status: 400 }
    );
  }

  try {
    const vaga = await criarVaga({
      cargo,
      senioridade,
      segmento,
      jobDescription,
      externalId,
      origem,
      requisitos,
      perguntas,
      fases,
      ativa
    });
    return NextResponse.json(
      { ...vaga, linkCandidato: `/entrevista/${vaga.id}` },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Erro ao gerar roteiro' }, { status: 500 });
  }
}
