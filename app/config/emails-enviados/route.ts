import { NextRequest, NextResponse } from 'next/server';
import { lerSessao } from '@/lib/auth';
import { listarEnviados } from '@/lib/email-templates';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode ver a caixa de saída' }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const evento = params.get('evento') ?? undefined;
  const status = params.get('status') ?? undefined;
  const limiteParam = params.get('limite');

  const enviados = await listarEnviados({ evento, status, limite: limiteParam ? Number(limiteParam) : undefined });
  return NextResponse.json(enviados);
}
