/**
 * Marca de uso único para o token de gravação (2026-08-14).
 *
 * O token assinado (lib/auth-edge.ts) prova que a gravação COMEÇOU pela tela de entrevista,
 * mas por si só não impede que a mesma credencial seja reaproveitada em vários envios — o que
 * é justamente o que acontece quando alguém captura o token no devtools e o usa para subir um
 * arquivo pré-gravado. Aqui o token é registrado no primeiro uso; a partir do segundo, o
 * chamador recebe `true` e registra o indício (sem bloquear — ver a rota de respostas).
 *
 * Usa Redis quando configurado (compartilhado entre instâncias serverless); sem Redis, cai
 * pra um Set em memória, que só enxerga a própria instância — melhor que nada, mas por isso
 * este sinal é tratado como indício e não como bloqueio.
 */

import { Redis } from '@upstash/redis';
import { createHash } from 'crypto';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = UPSTASH_URL && UPSTASH_TOKEN ? new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN }) : null;

/** TTL igual ao do token (10min) — depois disso ele expira sozinho e o registro é inútil. */
const TTL_SEG = 10 * 60;

const memoria = new Map<string, number>();

function limparMemoria() {
  const agora = Date.now();
  for (const [chave, expira] of memoria) {
    if (expira <= agora) memoria.delete(chave);
  }
}

/**
 * Registra o uso do token e informa se ele JÁ tinha sido usado antes.
 *
 * `verificado: false` significa que a checagem NÃO pôde rodar (Redis fora do ar, ou nem
 * configurado). Isso é diferente de "rodou e está limpo" — sem essa distinção, uma queda do
 * Redis deixaria todos os perfis aparentemente limpos e ninguém saberia que o controle parou.
 * O chamador decide o que fazer; hoje ele só registra em log, porque acusar o candidato por
 * uma falha da nossa infraestrutura seria injusto (e acusar TODOS, que é o que aconteceria
 * com fail-closed, seria pior ainda).
 */
export async function tokenJaUsado(token: string): Promise<{ usado: boolean; verificado: boolean }> {
  // Guarda só o hash — o token é uma credencial; não faz sentido persistir o valor cru.
  const chave = `gravacao-usada:${createHash('sha256').update(token).digest('hex').slice(0, 32)}`;

  if (redis) {
    try {
      // SET NX devolve null quando a chave já existia — operação atômica, sem race entre
      // uploads concorrentes.
      const definido = await redis.set(chave, 1, { nx: true, ex: TTL_SEG });
      return { usado: definido === null, verificado: true };
    } catch {
      return { usado: false, verificado: false };
    }
  }

  // Sem Redis: o Set em memória só enxerga a própria instância serverless, então um reuso
  // que caia em outra instância passa batido. Vale como rede de segurança parcial, mas não
  // conta como verificação confiável.
  limparMemoria();
  if (memoria.has(chave)) return { usado: true, verificado: true };
  memoria.set(chave, Date.now() + TTL_SEG * 1000);
  return { usado: false, verificado: false };
}
