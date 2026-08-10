import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { adicionarNotaAtomica } from '@/lib/store';
import type { NotaInterna } from '@/lib/types';
import { sanitizarTexto } from '@/lib/sanitize';
import { comFila } from '@/lib/queue';

export const dynamic = 'force-dynamic';

/** Comentários internos do recrutador sobre a candidatura — nunca visível ao candidato. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return comFila(`candidatura:${params.id}`, async () => {
    const body = await req.json();
    const textoRaw = typeof body?.texto === 'string' ? body.texto.trim() : '';
    if (!textoRaw) return NextResponse.json({ error: 'texto é obrigatório' }, { status: 400 });

    const texto = sanitizarTexto(textoRaw, 2000);
    const nota: NotaInterna = { id: randomUUID(), texto, criadoEm: new Date().toISOString() };

    const atualizada = await adicionarNotaAtomica(params.id, nota);
    if (!atualizada) {
      return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });
    }

    return NextResponse.json(atualizada, { status: 201 });
  });
}
