import { NextRequest, NextResponse } from 'next/server';
import { getCandidatura, saveCandidatura, getVaga } from '@/lib/store';
import { lerSessao } from '@/lib/auth';
import { registrarLog } from '@/lib/logs';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const candidatura = await getCandidatura(params.id);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

  const vaga = await getVaga(candidatura.vagaId);
  if (!vaga) return NextResponse.json({ error: 'Vaga da candidatura não encontrada' }, { status: 404 });

  const body = await req.json();
  const { fase } = body ?? {};

  const idsValidos = vaga.fases.map((f) => f.id);
  if (typeof fase !== 'string' || !idsValidos.includes(fase)) {
    return NextResponse.json({ error: `fase deve ser uma de: ${idsValidos.join(', ')}` }, { status: 400 });
  }

  const faseAnterior = candidatura.fase;
  candidatura.fase = fase;
  await saveCandidatura(candidatura);

  const sessao = await lerSessao(req);
  await registrarLog(
    'fase_alterada',
    { candidaturaId: candidatura.id, vagaId: vaga.id, de: faseAnterior, para: fase },
    sessao?.email
  );
  return NextResponse.json(candidatura);
}
