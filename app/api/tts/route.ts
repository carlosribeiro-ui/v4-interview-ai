import { NextRequest, NextResponse } from 'next/server';
import { sintetizarFala } from '@/lib/tts';
import { uploadParaR2 } from '@/lib/r2';
import { getVaga, saveVaga } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * Converte texto em áudio (voz natural via Gemini TTS) — usado pelo botão "Ouvir pergunta" da entrevista.
 *
 * Com `vagaId` + `perguntaId`, o áudio é cacheado no R2: a primeira chamada gera e salva a URL em
 * `vaga.perguntas[i].audioUrl`; chamadas seguintes para a mesma pergunta nem chegam aqui — o front toca
 * a URL salva direto. Sem esses IDs (compat), gera e devolve sem cachear.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const texto = typeof body?.texto === 'string' ? body.texto.trim() : '';
  const vagaId = typeof body?.vagaId === 'string' ? body.vagaId : undefined;
  const perguntaId = typeof body?.perguntaId === 'string' ? body.perguntaId : undefined;
  if (!texto) return NextResponse.json({ error: 'texto é obrigatório' }, { status: 400 });

  try {
    const wav = await sintetizarFala(texto);

    if (vagaId && perguntaId) {
      const vaga = await getVaga(vagaId);
      const pergunta = vaga?.perguntas.find((p) => p.id === perguntaId);
      if (vaga && pergunta) {
        const url = await uploadParaR2(`tts/${vagaId}/${perguntaId}.wav`, wav, 'audio/wav');
        pergunta.audioUrl = url;
        await saveVaga(vaga);
        return NextResponse.json({ audioUrl: url });
      }
    }

    return new NextResponse(new Uint8Array(wav), {
      headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Erro ao gerar áudio' }, { status: 500 });
  }
}
