/**
 * Throttle proativo pras chamadas Gemini — via Upstash Redis (cross-instance).
 *
 * Diferença pro rate-limit.ts: aquele REJEITA o excedente com 429 pro cliente
 * HTTP (correto pra proteger a API contra abuso). Esse aqui ESPERA até abrir
 * vaga dentro do RPM real da conta Gemini — adequado porque são chamadas de
 * saída em background (transcrição/avaliação já rodam fire-and-forget depois
 * do upload) ou de baixa frequência (TTS, clique manual), onde perder alguns
 * segundos de espera é bem melhor que estourar a cota da conta.
 *
 * Sem Upstash configurado (UPSTASH_REDIS_REST_URL/TOKEN ausentes), vira no-op —
 * não há como coordenar entre instâncias Vercel sem um datastore compartilhado,
 * então deixa passar direto (mesma degradação graciosa do resto do app).
 */

import { Redis } from '@upstash/redis';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

let redis: Redis | null = null;
if (UPSTASH_URL && UPSTASH_TOKEN) {
  redis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
}

/**
 * Janela fixa por minuto (UTC). Chave = `gemini-throttle:{recurso}:{AAAAMMDDHHmm}`.
 * INCR atômico: quem cai dentro do limite ganha a vaga na hora; quem estoura
 * espera até o próximo minuto e tenta de novo, até `maxEsperaMs`.
 */
function chaveJanela(recurso: string): string {
  const d = new Date();
  const janela =
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}` +
    `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return `gemini-throttle:${recurso}:${janela}`;
}

/**
 * Bloqueia até haver uma vaga pro `recurso` dentro de `limitePorMinuto`, ou até
 * `maxEsperaMs` esgotar (nesse caso deixa passar mesmo assim — o retry-on-429
 * de cada chamador é a rede de segurança final; não vale travar a request pra
 * sempre por causa do throttle).
 */
export async function aguardarVagaGemini(
  recurso: string,
  limitePorMinuto: number,
  maxEsperaMs = 20_000
): Promise<void> {
  if (!redis) return; // sem Redis não há como coordenar entre instâncias — no-op

  const inicio = Date.now();

  while (Date.now() - inicio < maxEsperaMs) {
    const chave = chaveJanela(recurso);
    let contagem: number;
    try {
      contagem = await redis.incr(chave);
      if (contagem === 1) {
        await redis.expire(chave, 70); // um pouco mais que 60s, cobre a virada de minuto
      }
    } catch {
      return; // Redis instável — não trava a chamada real por causa do throttle
    }

    if (contagem <= limitePorMinuto) return; // ganhou a vaga

    // Estourou a janela atual — espera até o próximo minuto virar (ou no máx 5s
    // por vez, pra não estourar maxEsperaMs sem checar).
    const agora = new Date();
    const segundosAteProximoMinuto = 60 - agora.getUTCSeconds();
    const espera = Math.min(segundosAteProximoMinuto * 1000, 5000);
    await new Promise((r) => setTimeout(r, espera));
  }
  // Esgotou o tempo de espera — segue em frente; retry-on-429 do chamador cobre o resto.
}
