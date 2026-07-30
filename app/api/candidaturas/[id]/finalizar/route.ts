import { NextRequest, NextResponse } from 'next/server';
import { getCandidatura, saveCandidatura } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const candidatura = await getCandidatura(params.id);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

  if (candidatura.respostas.length === 0) {
    return NextResponse.json({ error: 'Nenhuma resposta registrada ainda' }, { status: 400 });
  }

  // Respostas ainda "avaliando" (processamento em background) não entram na média
  // ainda — o job de background recalcula sozinho quando cada uma terminar.
  const avaliadas = candidatura.respostas.filter((r) => !r.avaliando);
  candidatura.scoreMedio = avaliadas.length
    ? Math.round((avaliadas.reduce((sum, r) => sum + r.score, 0) / avaliadas.length) * 10) / 10
    : null;
  candidatura.status = 'concluida';
  await saveCandidatura(candidatura);

  return NextResponse.json(candidatura);
}
