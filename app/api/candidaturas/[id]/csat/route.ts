import { NextRequest, NextResponse } from 'next/server';
import { getCandidatura, saveCandidatura } from '@/lib/store';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/candidaturas/[id]/csat
 * Salva a avaliação de satisfação do candidato (CSAT) com a plataforma.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const bloqueado = aplicarRateLimit(req, 'candidatura', LIMITES.candidaturaWrite);
  if (bloqueado) return bloqueado;

  const candidatura = await getCandidatura(params.id);
  if (!candidatura) return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { facilidadeUso, claridadePerguntas, qualidadeAudio, experienciaGeral, recomendaria, comentario } = body;

  // Validação: todas as notas devem ser 1-5
  const notas = [facilidadeUso, claridadePerguntas, qualidadeAudio, experienciaGeral, recomendaria];
  if (notas.some((n) => typeof n !== 'number' || n < 1 || n > 5)) {
    return NextResponse.json({ error: 'Todas as notas devem ser de 1 a 5' }, { status: 400 });
  }

  candidatura.csat = {
    facilidadeUso,
    claridadePerguntas,
    qualidadeAudio,
    experienciaGeral,
    recomendaria,
    comentario: typeof comentario === 'string' ? comentario.trim() || undefined : undefined,
    preenchidoEm: new Date().toISOString()
  };

  await saveCandidatura(candidatura);
  return NextResponse.json({ ok: true, csat: candidatura.csat });
}
