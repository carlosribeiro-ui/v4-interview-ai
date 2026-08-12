import { NextRequest, NextResponse } from 'next/server';
import { lerSessao } from '@/lib/auth';
import { listarLogs, logsParaCsv, type LogEvento } from '@/lib/logs';
import { gerarTabelaPdfBuffer } from '@/lib/tabela-pdf';

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

  if (formato === 'pdf') {
    const buffer = await gerarTabelaPdfBuffer({
      titulo: 'Logs de auditoria',
      subtitulo: `${logs.length} evento(s) · Gerado em ${new Date().toLocaleString('pt-BR')}`,
      colunas: [
        { chave: 'dataHora', titulo: 'Data/hora', largura: 1 },
        { chave: 'evento', titulo: 'Evento', largura: 1 },
        { chave: 'ator', titulo: 'Ator', largura: 1.2 },
        { chave: 'detalhes', titulo: 'Detalhes', largura: 2.5 }
      ],
      linhas: logs.map((l) => ({
        dataHora: new Date(l.criadoEm).toLocaleString('pt-BR'),
        evento: l.evento,
        ator: l.ator ?? '',
        detalhes: l.detalhes ? JSON.stringify(l.detalhes) : ''
      }))
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="logs.pdf"'
      }
    });
  }

  return NextResponse.json(logs);
}
