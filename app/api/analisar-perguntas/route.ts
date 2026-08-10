import { NextRequest, NextResponse } from 'next/server';
import { analisarPerguntas } from '@/lib/llm';
import { lerSessao } from '@/lib/auth';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  // V-SEC: Auth check — análise de perguntas usa Gemini (custo)
  const sessao = await lerSessao(req);
  if (!sessao || (sessao.role !== 'admin' && sessao.role !== 'talent')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // V-SEC: Rate limit
  const bloqueado = await aplicarRateLimit(req, 'analisar-perguntas', LIMITES.admin);
  if (bloqueado) return bloqueado;

  const body = await req.json();
  const { perguntas, cargo, senioridade, segmento } = body ?? {};

  if (!perguntas || !Array.isArray(perguntas) || perguntas.length === 0) {
    return NextResponse.json({ error: 'Envie ao menos uma pergunta.' }, { status: 400 });
  }

  try {
    const analise = await analisarPerguntas(perguntas, cargo, senioridade, segmento);
    return NextResponse.json({ analise });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
