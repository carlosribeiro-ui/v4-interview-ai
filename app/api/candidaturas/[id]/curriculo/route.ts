import { NextRequest, NextResponse } from 'next/server';
import { getCandidatura, saveCandidatura } from '@/lib/store';
import { uploadParaR2 } from '@/lib/r2';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const candidatura = await getCandidatura(params.id);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get('curriculo');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'curriculo (arquivo) é obrigatório' }, { status: 400 });
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Só é aceito PDF' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const curriculoPath = await uploadParaR2(`${params.id}/curriculo.pdf`, buffer, 'application/pdf');

  candidatura.curriculoPath = curriculoPath;
  await saveCandidatura(candidatura);

  return NextResponse.json(candidatura, { status: 201 });
}
