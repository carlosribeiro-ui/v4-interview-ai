import { NextRequest, NextResponse } from 'next/server';
import { getCandidatura, saveCandidatura, deleteCandidatura } from '@/lib/store';
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

/** Atualiza os dados que o próprio candidato preenche (linkedin, telefone, pretensão salarial, currículo, nome). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authErro = checarChaveExterna(req);
  if (authErro) return authErro;

  const candidatura = await getCandidatura(params.id);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (typeof body.nome === 'string' && body.nome.trim()) candidatura.nome = body.nome.trim();
  if (typeof body.linkedin === 'string') candidatura.linkedin = body.linkedin;
  if (typeof body.telefone === 'string') candidatura.telefone = body.telefone;
  if (typeof body.pretensaoSalarial === 'string') candidatura.pretensaoSalarial = body.pretensaoSalarial;
  if (typeof body.curriculoPath === 'string') candidatura.curriculoPath = body.curriculoPath;

  await saveCandidatura(candidatura);
  return NextResponse.json(candidatura);
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
