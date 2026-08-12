import { NextRequest, NextResponse } from 'next/server';
import { lerSessao } from '@/lib/auth';
import { gerarPerguntasVaga } from '@/lib/llm';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const sessao = await lerSessao(req);
  if (!sessao || (sessao.role !== 'admin' && sessao.role !== 'talent')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const bloqueado = await aplicarRateLimit(req, 'vagas-generate', LIMITES.admin, sessao.email);
  if (bloqueado) return bloqueado;

  const body = await req.json();
  const { cargo, senioridade, segmento, jobDescription, responsabilidades, requisitos, numeroPerguntas } = body ?? {};

  if (!cargo || !senioridade || !segmento) {
    return NextResponse.json(
      { error: 'cargo, senioridade e segmento são obrigatórios' },
      { status: 400 }
    );
  }

  if (!requisitos?.length) {
    return NextResponse.json(
      { error: 'requisitos são obrigatórios para gerar perguntas' },
      { status: 400 }
    );
  }

  const numPerguntas = Math.min(Math.max(Number(numeroPerguntas) || 7, 1), 15);

  try {
    const perguntas = await gerarPerguntasVaga({
      cargo, senioridade, segmento, jobDescription, responsabilidades, requisitos, numeroPerguntas: numPerguntas
    });
    return NextResponse.json({ perguntas });
  } catch (err: any) {
    console.error('[GerarPerguntas] Erro:', err);
    return NextResponse.json({ error: err.message ?? 'Erro ao gerar perguntas' }, { status: 500 });
  }
}
