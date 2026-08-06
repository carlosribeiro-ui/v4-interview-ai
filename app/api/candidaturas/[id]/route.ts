import { NextRequest, NextResponse } from 'next/server';
import { getCandidatura, getVaga, saveCandidatura, deleteCandidatura } from '@/lib/store';
import { lerSessao } from '@/lib/auth';
import { registrarLog } from '@/lib/logs';
import { deletarPrefixoR2 } from '@/lib/r2';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const candidatura = await getCandidatura(params.id);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

  const vaga = await getVaga(candidatura.vagaId);
  return NextResponse.json({ candidatura, vaga });
}

/**
 * Atualiza os dados que o próprio candidato preenche (linkedin, telefone, pretensão
 * salarial, currículo, nome) — usado tanto pelo formulário de entrevista (candidato não
 * loga, o id da candidatura funciona como token, igual já acontece no GET) quanto por
 * quem administra o painel.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode remover a candidatura' }, { status: 403 });
  }

  const candidatura = await getCandidatura(params.id);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

  await deleteCandidatura(params.id);
  // Cleanup best-effort: remove vídeos, CVs e TTS do R2 pra não deixar arquivos órfãos
  await deletarPrefixoR2(`${params.id}/`);
  await registrarLog(
    'candidatura_removida',
    { candidaturaId: params.id, vagaId: candidatura.vagaId, email: candidatura.email },
    sessao.email
  );
  return NextResponse.json({ ok: true });
}
