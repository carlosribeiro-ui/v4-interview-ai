import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getVaga, getCandidaturas, saveVaga, deleteVaga } from '@/lib/store';
import { lerSessao } from '@/lib/auth';
import { registrarLog } from '@/lib/logs';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const vaga = await getVaga(params.id);
  if (!vaga) return NextResponse.json({ error: 'Vaga não encontrada' }, { status: 404 });

  const todasCandidaturas = await getCandidaturas(params.id);
  const candidaturas = todasCandidaturas.sort((a, b) => {
    if (a.scoreMedio === null && b.scoreMedio === null) return 0;
    if (a.scoreMedio === null) return 1;
    if (b.scoreMedio === null) return -1;
    return b.scoreMedio - a.scoreMedio;
  });

  return NextResponse.json({ vaga, candidaturas });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode editar a vaga' }, { status: 403 });
  }

  const vaga = await getVaga(params.id);
  if (!vaga) return NextResponse.json({ error: 'Vaga não encontrada' }, { status: 404 });

  const body = await req.json();

  if (body.requisitos) vaga.requisitos = body.requisitos;

  if (body.perguntas) {
    vaga.perguntas = body.perguntas.map(
      (p: { id?: string; texto: string; criterios: string; tipo?: 'principal' | 'adicional' }) => ({
        id: p.id || randomUUID(),
        texto: p.texto,
        criterios: p.criterios,
        tipo: p.tipo ?? 'principal'
      })
    );
  }

  if (body.cargo) vaga.cargo = body.cargo;
  if (body.senioridade) vaga.senioridade = body.senioridade;
  if (body.segmento) vaga.segmento = body.segmento;
  if (typeof body.jobDescription === 'string') vaga.jobDescription = body.jobDescription;
  if (typeof body.ativa === 'boolean') vaga.ativa = body.ativa;

  await saveVaga(vaga);
  return NextResponse.json(vaga);
}

/** Remove a vaga e todas as candidaturas associadas — irreversível. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode remover a vaga' }, { status: 403 });
  }

  const vaga = await getVaga(params.id);
  if (!vaga) return NextResponse.json({ error: 'Vaga não encontrada' }, { status: 404 });

  const candidaturas = await getCandidaturas(params.id);
  await deleteVaga(params.id);
  await registrarLog(
    'vaga_removida',
    { vagaId: params.id, cargo: vaga.cargo, candidaturasRemovidas: candidaturas.length },
    sessao.email
  );
  return NextResponse.json({ ok: true, candidaturasRemovidas: candidaturas.length });
}
