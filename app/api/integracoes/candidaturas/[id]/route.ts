import { NextRequest, NextResponse } from 'next/server';
import { getCandidatura, deleteCandidatura, patchCandidaturaAtomica } from '@/lib/store';
import { checarChaveExterna } from '@/lib/auth-externa';
import { registrarLog } from '@/lib/logs';

export const dynamic = 'force-dynamic';

/** Candidatura completa (inclui respostas, transcrições, parecer) — pra sistemas externos que precisam do estado inteiro. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authErro = checarChaveExterna(req);
  if (authErro) return authErro;

  const candidatura = await getCandidatura(params.id);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });
  return NextResponse.json(candidatura);
}

/** Atualiza os dados via API externa — usa optimistic locking. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authErro = checarChaveExterna(req);
  if (authErro) return authErro;

  const candidatura = await getCandidatura(params.id);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  const campos: Record<string, unknown> = {};
  if (typeof body.nome === 'string' && body.nome.trim()) campos.nome = body.nome.trim();
  if (typeof body.linkedin === 'string') campos.linkedin = body.linkedin;
  if (typeof body.telefone === 'string') campos.telefone = body.telefone;
  if (typeof body.pretensaoSalarial === 'string') campos.pretensaoSalarial = body.pretensaoSalarial;
  if (typeof body.curriculoPath === 'string') campos.curriculoPath = body.curriculoPath;

  if (Object.keys(campos).length === 0) {
    return NextResponse.json(candidatura);
  }

  const atualizada = await patchCandidaturaAtomica(params.id, candidatura.version, campos);
  if (!atualizada) {
    return NextResponse.json({ error: 'Concorrência detectada — recarregue e tente novamente.' }, { status: 409 });
  }
  return NextResponse.json(atualizada);
}

/** Remove a candidatura (respostas e vídeos ficam órfãos no R2 — não é apagado do bucket). */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authErro = checarChaveExterna(req);
  if (authErro) return authErro;

  const candidatura = await getCandidatura(params.id);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

  await deleteCandidatura(params.id);
  await registrarLog('candidatura_removida', { candidaturaId: params.id, vagaId: candidatura.vagaId, email: candidatura.email }, 'api-externa');
  return NextResponse.json({ ok: true });
}
