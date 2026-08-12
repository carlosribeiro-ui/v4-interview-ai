import { NextRequest, NextResponse } from 'next/server';
import { salvarCsatAtomica } from '@/lib/store';
import { lerSessao, extrairCandidaturaId } from '@/lib/auth';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * POST /candidaturas/[id]/csat
 * Auth: candidato dono (token) ou admin/talent.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Auth check
  const sessao = await lerSessao(req);
  const candidatoId = await extrairCandidaturaId(req);
  if ((!sessao || (sessao.role !== 'admin' && sessao.role !== 'talent')) && candidatoId !== params.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const bloqueado = await aplicarRateLimit(req, 'candidatura', LIMITES.candidaturaWrite);
  if (bloqueado) return bloqueado;

  const body = await req.json().catch(() => ({}));
  const { facilidadeUso, claridadePerguntas, qualidadeAudio, experienciaGeral, recomendaria, comentario } = body;

  const notas = [facilidadeUso, claridadePerguntas, qualidadeAudio, experienciaGeral, recomendaria];
  if (notas.some((n) => typeof n !== 'number' || n < 1 || n > 5)) {
    return NextResponse.json({ error: 'Todas as notas devem ser de 1 a 5' }, { status: 400 });
  }

  const csat = {
    facilidadeUso,
    claridadePerguntas,
    qualidadeAudio,
    experienciaGeral,
    recomendaria,
    comentario: typeof comentario === 'string' ? comentario.trim() || undefined : undefined,
    preenchidoEm: new Date().toISOString()
  };

  const atualizada = await salvarCsatAtomica(params.id, csat);
  if (!atualizada) {
    return NextResponse.json({ error: 'Candidatura não encontrada' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, csat: atualizada.csat });
}
