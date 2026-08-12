import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getVaga, findCandidaturaPorEmail, criarCandidaturaAtomica } from '@/lib/store';
import type { Candidatura } from '@/lib/types';
import { registrarLog } from '@/lib/logs';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';
import { sanitizarCurto, sanitizarTexto } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

/**
 * Cria OU retoma a candidatura.
 * Idempotente por (vagaId, email): criarCandidaturaAtomica usa insertOne com
 * unique index, garantindo que duplo-submit nunca duplica.
 *  - nao existe            -> cria (201)
 *  - existe em_andamento   -> devolve a existente (200, retomada:true)
 *  - existe concluida      -> 409, entrevista ja finalizada
 */
export async function POST(req: NextRequest) {
  const bloqueado = await aplicarRateLimit(req, 'candidatura', LIMITES.candidaturaWrite);
  if (bloqueado) return bloqueado;

  const body = await req.json().catch(() => ({}));
  const { vagaId, nome, email, linkedin, telefone, pretensaoSalarial, segmento, nivelProfissional, formacao, pais, estado, cidade, idioma } = body ?? {};

  if (!vagaId || !nome || !email) {
    return NextResponse.json({ error: 'vagaId, nome e email são obrigatórios' }, { status: 400 });
  }

  // V-SEC: Valida tipos antes de usar em filtro Mongo (findOne) ou sanitize —
  // previne NoSQL injection via operadores ($ne, $gt etc.) enviados no lugar de string.
  const camposString: Record<string, unknown> = {
    vagaId, nome, email, linkedin, telefone, pretensaoSalarial,
    segmento, nivelProfissional, formacao, pais, estado, cidade, idioma
  };
  for (const [campo, valor] of Object.entries(camposString)) {
    if (valor !== undefined && typeof valor !== 'string') {
      return NextResponse.json({ error: `Campo '${campo}' deve ser texto` }, { status: 400 });
    }
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

  if (vaga.ativa === false) {
    return NextResponse.json({ error: 'Esta vaga está inativa e não aceita novas candidaturas.' }, { status: 409 });
  }

  const candidatura: Candidatura = {
    id: randomUUID(),
    vagaId,
    nome: sanitizarCurto(nome),
    email: email.trim().toLowerCase(),
    status: 'em_andamento',
    fase: 'triagem',
    respostas: [],
    scoreMedio: null,
    createdAt: new Date().toISOString(),
    version: 0,
    ...(linkedin ? { linkedin: sanitizarTexto(linkedin, 500) } : {}),
    ...(telefone ? { telefone: sanitizarCurto(telefone, 30) } : {}),
    ...(pretensaoSalarial ? { pretensaoSalarial: sanitizarCurto(pretensaoSalarial, 50) } : {}),
    ...(segmento ? { segmento: sanitizarCurto(segmento) } : {}),
    ...(nivelProfissional ? { nivelProfissional: sanitizarCurto(nivelProfissional) } : {}),
    ...(formacao ? { formacao: sanitizarCurto(formacao) } : {}),
    ...(pais ? { pais: sanitizarCurto(pais) } : {}),
    ...(estado ? { estado: sanitizarCurto(estado) } : {}),
    ...(cidade ? { cidade: sanitizarCurto(cidade) } : {}),
    ...(idioma ? { idioma: sanitizarCurto(idioma) } : {})
  };

  const { created, doc } = await criarCandidaturaAtomica(candidatura);
  await registrarLog('candidatura_criada', {
    candidaturaId: doc.id,
    vagaId,
    email,
    retomada: !created,
    teste: email.trim().toLowerCase().startsWith('teste+')
  });
  return NextResponse.json(doc, { status: created ? 201 : 200 });
}
