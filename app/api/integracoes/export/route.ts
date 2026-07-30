import { NextRequest, NextResponse } from 'next/server';
import { getVagas, getCandidaturas } from '@/lib/store';
import { checarChaveExterna } from '@/lib/auth-externa';

export const dynamic = 'force-dynamic';

/**
 * Dump completo de tudo que existe no sistema — todas as vagas (com perguntas, requisitos,
 * fases, ativa) e todas as candidaturas (com respostas, transcrições, parecer). Uma chamada
 * só, sem paginação, pra sincronizar/auditar do lado de fora sem precisar bater endpoint por
 * endpoint. Cresce com o volume de dados — se um dia isso pesar, é hora de paginar.
 */
export async function GET(req: NextRequest) {
  const authErro = checarChaveExterna(req);
  if (authErro) return authErro;

  const [vagas, candidaturas] = await Promise.all([getVagas(), getCandidaturas()]);
  return NextResponse.json({
    geradoEm: new Date().toISOString(),
    totalVagas: vagas.length,
    totalCandidaturas: candidaturas.length,
    vagas,
    candidaturas
  });
}
