import { NextRequest, NextResponse } from 'next/server';
import { getCandidaturas, getVaga, getVagas } from '@/lib/store';
import { checarChaveExterna } from '@/lib/auth-externa';

export const dynamic = 'force-dynamic';

/**
 * Consulta externa de candidaturas (status da entrevista + fase do pipeline
 * de seleção) — pra um sistema externo (ex: Pipefy via n8n) sincronizar o
 * card de acordo com o andamento aqui. Somente leitura.
 */
export async function GET(req: NextRequest) {
  const authErro = checarChaveExterna(req);
  if (authErro) return authErro;

  const vagaId = req.nextUrl.searchParams.get('vagaId');
  const vagaExternalId = req.nextUrl.searchParams.get('vagaExternalId');

  let alvoVagaId = vagaId ?? undefined;
  if (!alvoVagaId && vagaExternalId) {
    const vagas = await getVagas();
    alvoVagaId = vagas.find((v) => v.externalId === vagaExternalId)?.id;
    if (!alvoVagaId) {
      return NextResponse.json({ error: 'Vaga não encontrada' }, { status: 404 });
    }
  }
  if (vagaId && !(await getVaga(vagaId))) {
    return NextResponse.json({ error: 'Vaga não encontrada' }, { status: 404 });
  }

  const todasCandidaturas = await getCandidaturas(alvoVagaId);
  const candidaturas = todasCandidaturas.map((c) => ({
    id: c.id,
    vagaId: c.vagaId,
    nome: c.nome,
    email: c.email,
    status: c.status,
    fase: c.fase,
    scoreMedio: c.scoreMedio,
    createdAt: c.createdAt
  }));

  return NextResponse.json(candidaturas);
}
