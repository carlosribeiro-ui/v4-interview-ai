import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getVaga, saveVaga, deleteVaga, getCandidaturas } from '@/lib/store';
import { checarChaveExterna } from '@/lib/auth-externa';
import { registrarLog } from '@/lib/logs';

export const dynamic = 'force-dynamic';

/** Vaga completa (mesmos campos que o admin vê) — pra sistemas externos que precisam do estado inteiro. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authErro = checarChaveExterna(req);
  if (authErro) return authErro;

  const vaga = await getVaga(params.id);
  if (!vaga) return NextResponse.json({ error: 'Vaga não encontrada' }, { status: 404 });
  return NextResponse.json(vaga);
}

/** Atualização parcial via API — inclui ativar/inativar a vaga (`ativa`). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authErro = checarChaveExterna(req);
  if (authErro) return authErro;

  const vaga = await getVaga(params.id);
  if (!vaga) return NextResponse.json({ error: 'Vaga não encontrada' }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (typeof body.cargo === 'string') vaga.cargo = body.cargo;
  if (typeof body.senioridade === 'string') vaga.senioridade = body.senioridade;
  if (typeof body.segmento === 'string') vaga.segmento = body.segmento;
  if (typeof body.jobDescription === 'string') vaga.jobDescription = body.jobDescription;
  if (typeof body.ativa === 'boolean') vaga.ativa = body.ativa;
  if (typeof body.externalId === 'string') vaga.externalId = body.externalId;
  if (typeof body.origem === 'string') vaga.origem = body.origem;
  if (Array.isArray(body.requisitos)) vaga.requisitos = body.requisitos;
  if (Array.isArray(body.perguntas)) {
    vaga.perguntas = body.perguntas.map(
      (p: { id?: string; texto: string; criterios: string; tipo?: 'principal' | 'adicional' }) => ({
        id: p.id || randomUUID(),
        texto: p.texto,
        criterios: p.criterios,
        tipo: p.tipo ?? 'principal'
      })
    );
  }
  if (Array.isArray(body.fases) && body.fases.length > 0) vaga.fases = body.fases;

  await saveVaga(vaga);
  return NextResponse.json(vaga);
}

/** Remove a vaga e todas as candidaturas associadas — irreversível. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authErro = checarChaveExterna(req);
  if (authErro) return authErro;

  const vaga = await getVaga(params.id);
  if (!vaga) return NextResponse.json({ error: 'Vaga não encontrada' }, { status: 404 });

  const candidaturas = await getCandidaturas(params.id);
  await deleteVaga(params.id);
  await registrarLog('vaga_removida', { vagaId: params.id, cargo: vaga.cargo, candidaturasRemovidas: candidaturas.length }, 'api-externa');
  return NextResponse.json({ ok: true, candidaturasRemovidas: candidaturas.length });
}
