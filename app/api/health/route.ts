import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { estatisticasFila } from '@/lib/jobs';

export const dynamic = 'force-dynamic';

/**
 * Health check + métricas do sistema.
 * Retorna status do DB, fila de jobs, e uptime.
 */
export async function GET() {
  const start = performance.now();

  try {
    const db = await getDb();
    await db.command({ ping: 1 });

    const jobs = await estatisticasFila();
    const latenciaMs = Math.round(performance.now() - start);

    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      dbLatencyMs: latenciaMs,
      jobs,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
      }
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'degraded',
        db: 'unreachable',
        error: 'Database connection failed',
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    );
  }
}
