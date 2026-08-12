import { NextRequest, NextResponse } from 'next/server';
import { lerSessao } from '@/lib/auth';
import { listarLogs, logsParaCsv, type LogEvento } from '@/lib/logs';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao || sessao.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin pode ver os logs' }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const evento = params.get('evento');
  const ator = params.get('ator') ?? undefined;
  const desde = params.get('desde') ?? undefined;
  const ate = params.get('ate') ?? undefined;
  const q = params.get('q') ?? undefined;
  const formato = params.get('formato');
  const limiteParam = params.get('limite');

  const logs = await listarLogs({
    evento: (evento as LogEvento) || undefined,
    ator,
    desde,
    ate,
    q,
    limite: limiteParam ? Number(limiteParam) : undefined
  });

  if (formato === 'csv') {
    return new NextResponse(logsParaCsv(logs), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="logs.csv"'
      }
    });
  }

  return NextResponse.json(logs);
}
