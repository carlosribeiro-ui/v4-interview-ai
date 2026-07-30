import { NextRequest, NextResponse } from 'next/server';
import { getVagas } from '@/lib/store';
import { criarVaga } from '@/lib/vagas';
import { lerSessao } from '@/lib/auth';
import { registrarLog } from '@/lib/logs';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getVagas());
}

export async function POST(req: NextRequest) {
  // admin e talent podem criar vaga (talent usa isso pra "Testar entrevista").
  const sessao = await lerSessao(req);
  if (!sessao) {
    return NextResponse.json({ error: 'Faça login para criar uma vaga' }, { status: 401 });
  }

  const body = await req.json();
  const { cargo, senioridade, segmento, jobDescription } = body ?? {};

  if (!cargo || !senioridade || !segmento) {
    return NextResponse.json(
      { error: 'cargo, senioridade e segmento são obrigatórios' },
      { status: 400 }
    );
  }

  try {
    const vaga = await criarVaga({ cargo, senioridade, segmento, jobDescription });
    await registrarLog('vaga_criada', { vagaId: vaga.id, cargo: vaga.cargo }, sessao.email);
    return NextResponse.json(vaga, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Erro ao gerar roteiro' }, { status: 500 });
  }
}
