import { NextRequest, NextResponse } from 'next/server';
import { lerSessao } from '@/lib/auth';
import { gerarDescricaoVaga } from '@/lib/llm';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao || (sessao.role !== 'admin' && sessao.role !== 'talent')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const bloqueado = await aplicarRateLimit(req, 'vagas-generate', LIMITES.admin);
  if (bloqueado) return bloqueado;

  const body = await req.json();
  const { cargo, senioridade, segmento, formacaoAcademica, idiomaEntrevista, pais, estado, cidade } = body ?? {};

  if (!cargo || !senioridade || !segmento) {
    return NextResponse.json(
      { error: 'cargo, senioridade e segmento são obrigatórios' },
      { status: 400 }
    );
  }

  try {
    const resultado = await gerarDescricaoVaga({
      cargo, senioridade, segmento, formacaoAcademica, idiomaEntrevista, pais, estado, cidade
    });
    return NextResponse.json(resultado);
  } catch (err: any) {
    console.error('[GerarDescricao] Erro:', err);
    return NextResponse.json({ error: err.message ?? 'Erro ao gerar descrição' }, { status: 500 });
  }
}
