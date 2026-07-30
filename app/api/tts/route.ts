import { NextRequest, NextResponse } from 'next/server';
import { sintetizarFala } from '@/lib/tts';

export const dynamic = 'force-dynamic';

/** Converte texto em áudio (voz natural via Gemini TTS) — usado pelo botão "Ouvir pergunta" da entrevista. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const texto = typeof body?.texto === 'string' ? body.texto.trim() : '';
  if (!texto) return NextResponse.json({ error: 'texto é obrigatório' }, { status: 400 });

  try {
    const wav = await sintetizarFala(texto);
    return new NextResponse(new Uint8Array(wav), {
      headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Erro ao gerar áudio' }, { status: 500 });
  }
}
