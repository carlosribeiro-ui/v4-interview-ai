import { NextRequest, NextResponse } from 'next/server';
import { sintetizarFala } from '@/lib/tts';
import { uploadParaR2 } from '@/lib/r2';
import { getVaga, saveVaga } from '@/lib/store';
import { aplicarRateLimit, LIMITES } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * Converte texto em áudio (voz natural via Gemini TTS) — usado pelo botão "Ouvir pergunta" da entrevista.
 *
 * BUG FIX: SEMPRE regenera o áudio quando chamado — nunca serve cache obsoleto.
 * O frontend agora sempre chama a API (não toca audioUrl direto), então o áudio
 * sempre corresponde ao texto atual da pergunta.
 */
export async function POST(req: NextRequest) {
  const bloqueado = await aplicarRateLimit(req, 'tts', LIMITES.tts);
  if (bloqueado) return bloqueado;

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
        // Nota: saveVaga aqui é aceitável porque audioUrl é idempotente (último write vence)
        // e a operação é de baixa concorrência (só dispara quando candidato clica "Ouvir pergunta").
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
