import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getVaga, getCandidaturas, updateVaga, deleteVaga } from '@/lib/store';
import { lerSessao, verificarTokenVersion } from '@/lib/auth';
import { registrarLog } from '@/lib/logs';
import { deletarPrefixoR2 } from '@/lib/r2';
import { comFila } from '@/lib/queue';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // V-SEC: Auth check — vaga com candidaturas contém dados sensíveis (vídeos, transcrições, scores)
  const sessao = await lerSessao(req);
  if (!sessao || (sessao.role !== 'admin' && sessao.role !== 'talent')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // V-SEC: Rate limit
  const bloqueado = await aplicarRateLimit(req, 'vaga-detail', LIMITES.admin, sessao.email);
  if (bloqueado) return bloqueado;

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

/**
 * PATCH com fila — serializa updates concorrentes para a mesma vaga.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return comFila(`vaga:${params.id}`, async () => {
    const sessao = await lerSessao(req);
    if (!sessao || sessao.role !== 'admin') {
      return NextResponse.json({ error: 'Apenas admin pode editar a vaga' }, { status: 403 });
    }
    // V-SEC: Verifica tokenVersion — previne uso de sessão revogada
    if (!(await verificarTokenVersion(sessao))) {
      return NextResponse.json({ error: 'Sessão expirada — faça login novamente' }, { status: 401 });
    }

    const vaga = await getVaga(params.id);
    if (!vaga) return NextResponse.json({ error: 'Vaga não encontrada' }, { status: 404 });

    const body = await req.json();

    const fields: Record<string, unknown> = {};
    if (body.requisitos) fields.requisitos = body.requisitos;
    if (body.perguntas) {
      fields.perguntas = body.perguntas.map(
        (p: { id?: string; texto: string; criterios: string; tipo?: 'principal' | 'adicional' }) => ({
          id: p.id || randomUUID(),
          texto: p.texto,
          criterios: p.criterios,
          tipo: p.tipo ?? 'principal'
        })
      );
    }
    if (body.cargo) fields.cargo = body.cargo;
    if (body.senioridade) fields.senioridade = body.senioridade;
    if (body.segmento) fields.segmento = body.segmento;
    if (typeof body.jobDescription === 'string') fields.jobDescription = body.jobDescription;
    if (typeof body.ativa === 'boolean') fields.ativa = body.ativa;
    if (typeof body.prioritaria === 'boolean') fields.prioritaria = body.prioritaria;
    if (typeof body.avaliarIdioma === 'boolean') fields.avaliarIdioma = body.avaliarIdioma;

    const atualizada = await updateVaga(params.id, vaga.version, fields);
    if (!atualizada) {
      return NextResponse.json({ error: 'Concorrência detectada — recarregue e tente novamente.' }, { status: 409 });
    }

    return NextResponse.json(atualizada);
  });
}

/** Remove a vaga e todas as candidaturas associadas — irreversível. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode remover a vaga' }, { status: 403 });
  }
  // V-SEC: Verifica tokenVersion em operações destrutivas
  if (!(await verificarTokenVersion(sessao))) {
    return NextResponse.json({ error: 'Sessão expirada — faça login novamente' }, { status: 401 });
  }

  const vaga = await getVaga(params.id);
  if (!vaga) return NextResponse.json({ error: 'Vaga não encontrada' }, { status: 404 });

  const candidaturas = await getCandidaturas(params.id);
  await deleteVaga(params.id);
  for (const c of candidaturas) {
    await deletarPrefixoR2(`${c.id}/`);
  }
  await deletarPrefixoR2(`tts/${params.id}/`);
  await registrarLog(
    'vaga_removida',
    { vagaId: params.id, cargo: vaga.cargo, candidaturasRemovidas: candidaturas.length },
    sessao.email
  );
  return NextResponse.json({ ok: true, candidaturasRemovidas: candidaturas.length });
}
