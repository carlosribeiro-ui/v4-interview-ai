import { NextRequest, NextResponse } from 'next/server';
import { getVagas } from '@/lib/store';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * Listagem pública e enxuta de vagas — usada na tela "Outras vagas disponíveis"
 * ao final da entrevista. Sem autenticação (candidato nunca loga), por isso só
 * expõe o mínimo (nada de requisitos/critérios/JD/fases internas).
 */
export async function GET(req: NextRequest) {
  const bloqueado = await aplicarRateLimit(req, 'vagas-publicas', LIMITES.publicRead);
  if (bloqueado) return bloqueado;

  const todasVagas = await getVagas();
  const vagas = todasVagas
    .filter((v) => v.ativa !== false)
    .map((v) => ({
      id: v.id,
      cargo: v.cargo,
      senioridade: v.senioridade,
      segmento: v.segmento
    }));
  // CDN: cache público por 60s, stale 120s
  const res = NextResponse.json(vagas);
  res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  return res;
}
