const GEMINI_TTS_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';

/** Máximo de retentativas em erros transitórios (429 rate limit, 5xx, timeout/rede). */
const MAX_RETRIES = 3;

import { medir } from './metrics';

/** PCM 16-bit mono a 24kHz — formato fixo devolvido pelo Gemini TTS. */
function pcmParaWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = pcm.length;
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate (16-bit mono)
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

/** Sintetiza `texto` em voz natural (pt-BR) via Gemini TTS e devolve um WAV pronto pra tocar no navegador. */
export async function sintetizarFala(texto: string): Promise<Buffer> {
  return medir('gemini.tts', async () => {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('GEMINI_API_KEY nao configurada no .env.local');

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `Leia em voz alta, em portugues do Brasil, num tom natural e conversacional, como se estivesse falando com uma pessoa: ${texto}` }]
      }
    ],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
      }
    }
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(`${GEMINI_TTS_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Retry em erros transitórios (429 rate limit, 5xx) — honra Retry-After
      // se o Gemini mandar, senão backoff exponencial (1s, 2s, 4s).
      if (res.status === 429 || res.status >= 500) {
        const retryAfterHeader = res.headers.get('retry-after');
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
        const text = await res.text().catch(() => '');
        lastError = new Error(`Gemini TTS HTTP ${res.status}: ${text}`);
        await new Promise((r) => setTimeout(r, retryAfterMs ?? 1000 * 2 ** attempt));
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Gemini TTS HTTP ${res.status}: ${text}`);
      }

      const json = await res.json();
      const parte = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!parte?.data) throw new Error('Gemini TTS nao devolveu audio');

      const pcm = Buffer.from(parte.data, 'base64');
      return pcmParaWav(pcm);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        lastError = new Error('Gemini TTS timeout (30s) — texto muito longo ou rede lenta');
        continue;
      }
      if (err.code === 'ECONNRESET' || err.code === 'ENOTFOUND') {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error('Gemini TTS: todas as retentativas falharam');
  }, { textoLength: texto.length });
}
