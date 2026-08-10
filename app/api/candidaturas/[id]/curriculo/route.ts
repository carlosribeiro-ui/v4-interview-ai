import { NextRequest, NextResponse } from 'next/server';
import { salvarCurriculoAtomica } from '@/lib/store';
import { uploadParaR2 } from '@/lib/r2';
import { lerSessao, extrairCandidaturaId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Tamanho máximo: 10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Magic bytes do PDF: %PDF */
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Auth: session OU candidato dono
  const sessao = await lerSessao(req);
  const candidatoId = await extrairCandidaturaId(req);
  if ((!sessao || (sessao.role !== 'admin' && sessao.role !== 'talent')) && candidatoId !== params.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('curriculo');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'curriculo (arquivo) é obrigatório' }, { status: 400 });
  }

  // V-08: File size limit
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Arquivo excede o limite de 10MB' }, { status: 413 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'Arquivo vazio' }, { status: 400 });
  }

  // V-09: Magic byte validation (PDF must start with %PDF)
  const buffer = Buffer.from(await file.arrayBuffer());
  const header = buffer.subarray(0, 4);
  const isPdf = header.length >= 4 &&
    header[0] === PDF_MAGIC[0] && header[1] === PDF_MAGIC[1] &&
    header[2] === PDF_MAGIC[2] && header[3] === PDF_MAGIC[3];

  if (!isPdf) {
    return NextResponse.json({ error: 'Arquivo não é um PDF válido' }, { status: 400 });
  }

  const curriculoPath = await uploadParaR2(`${params.id}/curriculo.pdf`, buffer, 'application/pdf');

  const atualizada = await salvarCurriculoAtomica(params.id, curriculoPath);
  if (!atualizada) {
    return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });
  }

  return NextResponse.json(atualizada, { status: 201 });
}
