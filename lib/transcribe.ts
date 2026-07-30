import fs from 'fs';
import path from 'path';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
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
        // sem isto o "thinking" do 2.5-flash consome o orcamento e a
        // transcricao volta vazia
        thinkingConfig: { thinkingBudget: 0 }
      }
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini transcricao HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  const text: string =
    json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? '';
  return text.trim();
}
