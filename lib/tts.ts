const GEMINI_TTS_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';

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
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('GEMINI_API_KEY nao configurada no .env.local');

  const res = await fetch(`${GEMINI_TTS_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
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
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini TTS HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  const parte = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!parte?.data) throw new Error('Gemini TTS nao devolveu audio');

  const pcm = Buffer.from(parte.data, 'base64');
  return pcmParaWav(pcm);
}
