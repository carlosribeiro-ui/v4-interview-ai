import { NextRequest, NextResponse } from 'next/server';
import { getVaga, saveVaga, getCandidaturas } from '@/lib/store';
import { lerSessao } from '@/lib/auth';
import type { FaseDef, CorFase } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CORES: CorFase[] = ['neutro', 'atencao', 'sucesso', 'perigo'];

function validarFases(body: unknown): FaseDef[] | null {
  if (!body || typeof body !== 'object' || !Array.isArray((body as any).fases)) return null;
  const fases = (body as any).fases as unknown[];
  if (fases.length === 0) return null;

  const vistos = new Set<string>();
  const resultado: FaseDef[] = [];
  for (const f of fases) {
    if (
      !f ||
      typeof f !== 'object' ||
      typeof (f as any).id !== 'string' ||
      !(f as any).id.trim() ||
      typeof (f as any).nome !== 'string' ||
      !(f as any).nome.trim() ||
      !CORES.includes((f as any).cor)
    ) {
      return null;
    }
    const id = (f as any).id.trim();
    if (vistos.has(id)) return null;
    vistos.add(id);
    resultado.push({ id, nome: (f as any).nome.trim(), cor: (f as any).cor });
  }
  return resultado;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode gerenciar fases' }, { status: 403 });
  }

  const vaga = await getVaga(params.id);
  if (!vaga) return NextResponse.json({ error: 'Vaga não encontrada' }, { status: 404 });

  const body = await req.json();
  const novasFases = validarFases(body);
  if (!novasFases) {
    return NextResponse.json(
      { error: 'fases deve ser uma lista não vazia de { id, nome, cor } com ids únicos e cor em neutro/atencao/sucesso/perigo' },
      { status: 400 }
    );
  }

  const idsNovos = new Set(novasFases.map((f) => f.id));
  const idsRemovidos = vaga.fases.filter((f) => !idsNovos.has(f.id)).map((f) => f.id);

  if (idsRemovidos.length > 0) {
    const candidaturas = await getCandidaturas(params.id);
    for (const faseId of idsRemovidos) {
      const emUso = candidaturas.filter((c) => c.fase === faseId);
      if (emUso.length > 0) {
        const nome = vaga.fases.find((f) => f.id === faseId)?.nome ?? faseId;
        return NextResponse.json(
          {
            error: `${emUso.length} candidato(s) estão em "${nome}" — mova-os antes de excluir esta fase.`
          },
          { status: 409 }
        );
      }
    }
  }

  vaga.fases = novasFases;
  await saveVaga(vaga);
  return NextResponse.json(vaga);
}
