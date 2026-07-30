import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getCandidatura, saveCandidatura } from '@/lib/store';
import type { NotaInterna } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Comentários internos do recrutador sobre a candidatura — nunca visível ao candidato. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const candidatura = await getCandidatura(params.id);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

  const body = await req.json();
  const texto = typeof body?.texto === 'string' ? body.texto.trim() : '';
  if (!texto) return NextResponse.json({ error: 'texto é obrigatório' }, { status: 400 });

  const nota: NotaInterna = { id: randomUUID(), texto, criadoEm: new Date().toISOString() };
  candidatura.notasInternas = [...(candidatura.notasInternas ?? []), nota];
  await saveCandidatura(candidatura);

  return NextResponse.json(candidatura, { status: 201 });
}
