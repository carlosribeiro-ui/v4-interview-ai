import fs from 'fs';
import path from 'path';
import { aguardarVagaGemini } from './gemini-throttle';
import { RECURSO_GEMINI_FLASH } from './llm';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/** Máximo de retentativas em erros transitórios (429 rate limit, 5xx, timeout/rede). */
const MAX_RETRIES = 3;
/** Mesmo modelo/cota de lib/llm.ts (RPM=1000, margem em 800) — throttle compartilhado. */
const FLASH_LIMITE_RPM = 800;

const MIME_BY_EXT: Record<string, string> = {
  '.webm': 'audio/webm',
  '.mp3': 'audio/mp3',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac'
};

export async function transcribeAudio(filePath: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY nao configurada no .env.local');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext] || 'audio/webm';
  const data = fs.readFileSync(filePath).toString('base64');

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'Transcreva integralmente a fala deste audio em portugues do Brasil. Responda APENAS com o texto transcrito, sem comentarios, sem marcacoes de tempo e sem identificar locutores. Se nao houver fala audivel, responda com string vazia.'
          },
          { inlineData: { mimeType, data } }
        ]
      }
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 8000,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await aguardarVagaGemini(RECURSO_GEMINI_FLASH, FLASH_LIMITE_RPM);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000); // 60s pra vídeos grandes

    try {
      const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Retry em erros transitórios (429 rate limit, 5xx server error) — honra
      // Retry-After se o Gemini mandar, senão backoff exponencial (1s, 2s, 4s).
      if (res.status === 429 || res.status >= 500) {
        const retryAfterHeader = res.headers.get('retry-after');
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
        const texto = await res.text().catch(() => '');
        lastError = new Error(`Gemini transcricao HTTP ${res.status}: ${texto}`);
        await new Promise((r) => setTimeout(r, retryAfterMs ?? 1000 * 2 ** attempt));
        continue;
      }

      if (!res.ok) {
        const texto = await res.text().catch(() => '');
        throw new Error(`Gemini transcricao HTTP ${res.status}: ${texto}`);
      }

      const json = await res.json();
      const text: string =
        json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? '';
      return text.trim();
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        lastError = new Error('Gemini transcricao timeout (60s) — vídeo muito longo ou rede lenta');
        continue;
      }
      // Erros de rede transitórios também merecem retry
      if (err.code === 'ECONNRESET' || err.code === 'ENOTFOUND') {
        lastError = err;
        continue;
      }
      // Erros não-transitórios (ex: HTTP 4xx que não seja 429): throw imediato
      throw err;
    }
  }

  throw lastError ?? new Error('Gemini transcricao: todas as retentativas falharam');
}
