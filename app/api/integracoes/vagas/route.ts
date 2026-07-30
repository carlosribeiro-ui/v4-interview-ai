import { NextRequest, NextResponse } from 'next/server';
import { getVagas, getCandidaturas } from '@/lib/store';
import { criarVaga } from '@/lib/vagas';
import { checarChaveExterna } from '@/lib/auth-externa';

export const dynamic = 'force-dynamic';

/**
 * API para sistemas externos (ex: n8n, Pipefy via automação) criarem e
 * consultarem vagas sem passar pelo painel admin. Autenticada por header
 * x-api-key (ver lib/auth-externa.ts).
 */
export async function GET(req: NextRequest) {
  const authErro = checarChaveExterna(req);
  if (authErro) return authErro;

  const externalId = req.nextUrl.searchParams.get('externalId');
  const todasVagas = await getVagas();
  const vagas = todasVagas.filter((v) => !externalId || v.externalId === externalId);
  const todasCandidaturas = await getCandidaturas();

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
      createdAt: vaga.createdAt,
      linkCandidato: `/entrevista/${vaga.id}`,
      totalCandidatos: candidaturas.length,
      concluidos: concluidas.length,
      scoreMedio: scoreMedio !== null ? Math.round(scoreMedio * 10) / 10 : null
    };
  });

  return NextResponse.json(resultado);
}

export async function POST(req: NextRequest) {
  const authErro = checarChaveExterna(req);
  if (authErro) return authErro;

  const body = await req.json();
  const { cargo, senioridade, segmento, jobDescription, externalId, origem } = body ?? {};

  if (!cargo || !senioridade || !segmento) {
    return NextResponse.json(
      { error: 'cargo, senioridade e segmento são obrigatórios' },
      { status: 400 }
    );
  }

  try {
    const vaga = await criarVaga({ cargo, senioridade, segmento, jobDescription, externalId, origem });
    return NextResponse.json(
      { ...vaga, linkCandidato: `/entrevista/${vaga.id}` },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Erro ao gerar roteiro' }, { status: 500 });
  }
}
