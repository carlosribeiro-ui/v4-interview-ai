import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getVaga, saveCandidatura, findCandidaturaPorEmail } from '@/lib/store';
import type { Candidatura } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Cria OU retoma a candidatura.
 * Idempotente por (vagaId, email): reenviar o mesmo par nunca duplica.
 *  - nao existe            -> cria (201)
 *  - existe em_andamento   -> devolve a existente (200, retomada:true)
 *  - existe concluida      -> 409, entrevista ja finalizada
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vagaId, nome, email, linkedin, telefone, pretensaoSalarial } = body ?? {};

  if (!vagaId || !nome || !email) {
    return NextResponse.json({ error: 'vagaId, nome e email são obrigatórios' }, { status: 400 });
  }

  const vaga = await getVaga(vagaId);
  if (!vaga) return NextResponse.json({ error: 'Vaga não encontrada' }, { status: 404 });

  const existente = await findCandidaturaPorEmail(vagaId, email);
  if (existente) {
    if (existente.status === 'concluida') {
      return NextResponse.json(
        { error: 'Esta entrevista já foi concluída com este e-mail.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ ...existente, retomada: true }, { status: 200 });
  }

  const candidatura: Candidatura = {
    id: randomUUID(),
    vagaId,
    nome,
    email,
    status: 'em_andamento',
    fase: 'triagem',
    respostas: [],
    scoreMedio: null,
    createdAt: new Date().toISOString(),
    ...(linkedin ? { linkedin } : {}),
    ...(telefone ? { telefone } : {}),
    ...(pretensaoSalarial ? { pretensaoSalarial } : {})
  };

  await saveCandidatura(candidatura);
  return NextResponse.json(candidatura, { status: 201 });
}
