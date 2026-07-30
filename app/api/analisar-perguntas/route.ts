import { NextRequest, NextResponse } from 'next/server';
import { analisarPerguntas } from '@/lib/llm';

export async function POST(req: NextRequest) {
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
