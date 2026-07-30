import { NextRequest, NextResponse } from 'next/server';
import { getCandidatura, getVaga } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const candidatura = await getCandidatura(params.id);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

  const vaga = await getVaga(candidatura.vagaId);
  return NextResponse.json({ candidatura, vaga });
}
