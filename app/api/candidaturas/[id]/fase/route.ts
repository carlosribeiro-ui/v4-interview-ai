import { NextRequest, NextResponse } from 'next/server';
import { getVaga, getCandidatura, alterarFaseAtomica } from '@/lib/store';
import { lerSessao, verificarTokenVersion } from '@/lib/auth';
import { registrarLog } from '@/lib/logs';
import { comFila } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return comFila(`candidatura:${params.id}`, async () => {
    // V-SEC: Auth check + tokenVersion
    const sessao = await lerSessao(req);
    if (!sessao || (sessao.role !== 'admin' && sessao.role !== 'talent')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (!(await verificarTokenVersion(sessao))) {
      return NextResponse.json({ error: 'Sessão expirada — faça login novamente' }, { status: 401 });
    }

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

    const atualizada = await alterarFaseAtomica(params.id, candidatura.version, fase);
    if (!atualizada) {
      return NextResponse.json({ error: 'Concorrência detectada — recarregue e tente novamente.' }, { status: 409 });
    }

    await registrarLog(
      'fase_alterada',
      { candidaturaId: params.id, vagaId: vaga.id, de: faseAnterior, para: fase },
      sessao?.email
    );
    return NextResponse.json(atualizada);
  });
}
