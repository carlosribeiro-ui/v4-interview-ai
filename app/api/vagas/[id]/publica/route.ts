import { NextRequest, NextResponse } from 'next/server';
import { getVaga } from '@/lib/store';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * Versão pública (sem auth) de GET /api/vagas/[id] — usada pela página de entrevista
 * (/entrevista/[vagaId]), que candidatos externos acessam sem estar logados.
 *
 * V-SEC: GET /api/vagas/[id] (a rota "cheia") exige sessão admin/talent de propósito —
 * ela devolve TODAS as candidaturas da vaga (nomes, scores, vídeos de outros candidatos).
 * Essa rota aqui devolve só o subconjunto seguro pra montar a entrevista, e
 * explicitamente NUNCA inclui `criterios` de avaliação de cada pergunta (a IA usa
 * pra pontuar a resposta — se o candidato visse, poderia "decorar a resposta certa").
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const bloqueado = await aplicarRateLimit(req, 'vaga-publica-detail', LIMITES.publicRead);
  if (bloqueado) return bloqueado;

  const vaga = await getVaga(params.id);
  if (!vaga || vaga.ativa === false) {
    return NextResponse.json({ error: 'Vaga não encontrada' }, { status: 404 });
  }

  return NextResponse.json({
    vaga: {
      id: vaga.id,
      cargo: vaga.cargo,
      senioridade: vaga.senioridade,
      segmento: vaga.segmento,
      avaliarIdioma: vaga.avaliarIdioma ?? false,
      perguntas: vaga.perguntas.map((p) => ({
        id: p.id,
        texto: p.texto,
        tipo: p.tipo,
        audioUrl: p.audioUrl
        // criterios NUNCA vai pro candidato
      }))
    }
  });
}
