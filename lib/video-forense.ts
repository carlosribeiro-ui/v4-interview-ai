/**
 * Análise forense do arquivo de vídeo recebido — SEM ffmpeg (não existe no Vercel serverless,
 * ver o histórico de lib/video.ts). Faz parsing direto do container pra extrair fatos que o
 * candidato não controla facilmente e que podem CONTRADIZER a narrativa de "gravei agora, ao
 * vivo, nesta tela".
 *
 * Princípio de design (2026-08-14): estes sinais NUNCA rejeitam o upload com mensagem
 * explicativa. Rejeitar ensina o atacante exatamente qual é a checagem e ele ajusta a próxima
 * tentativa. Em vez disso o upload é aceito normalmente e o sinal fica registrado pro
 * recrutador ver — ver `sinaisIntegridade` em lib/types.ts e o uso em
 * app/candidaturas/[id]/respostas/route.ts.
 */

/** Um indício de que o vídeo pode não ser uma gravação ao vivo desta sessão. */
export type SinalIntegridade = {
  /** Código estável pra agregação/filtro. */
  codigo:
    | 'sem_token'
    | 'token_invalido'
    | 'token_reusado'
    | 'container_inesperado'
    | 'duracao_excede_janela'
    | 'duracao_muito_menor'
    | 'metadados_de_edicao'
    | 'regravacao_repetida';
  /** Texto pro recrutador — explica o que foi observado, sem jargão. */
  detalhe: string;
  /** alto = contradição factual (dificilmente inocente); medio/baixo = indício. */
  peso: 'alto' | 'medio' | 'baixo';
};

// ─── Parsing de container ──────────────────────────────────────────────────

/** Lê um "variable-size integer" do EBML (WebM). Retorna valor e quantos bytes consumiu. */
function lerVint(buf: Buffer, pos: number, manterMarcador: boolean): { valor: number; tamanho: number } | null {
  if (pos >= buf.length) return null;
  const primeiro = buf[pos];
  if (primeiro === 0) return null;
  let tamanho = 1;
  let mascara = 0x80;
  while (tamanho <= 8 && !(primeiro & mascara)) {
    mascara >>= 1;
    tamanho++;
  }
  if (tamanho > 8 || pos + tamanho > buf.length) return null;
  let valor = manterMarcador ? primeiro : primeiro & (mascara - 1);
  for (let i = 1; i < tamanho; i++) {
    valor = valor * 256 + buf[pos + i];
  }
  return { valor, tamanho };
}

/**
 * Extrai a duração declarada de um WebM percorrendo Segment > Info > {TimecodeScale, Duration}.
 * Retorna null quando o header não declara duração — o que é o caso NORMAL de gravação ao vivo
 * (o MediaRecorder não sabe a duração quando começa a escrever o header).
 */
function duracaoWebm(buf: Buffer): number | null {
  const ID_SEGMENT = 0x18538067;
  const ID_INFO = 0x1549a966;
  const ID_TIMECODE_SCALE = 0x2ad7b1;
  const ID_DURATION = 0x4489;

  function percorrer(inicio: number, fim: number, alvoPai: number | null): { escala: number; duracao: number } | null {
    let pos = inicio;
    let escala = 1_000_000; // default do Matroska: 1ms em nanossegundos
    let duracao: number | null = null;

    while (pos < fim) {
      const id = lerVint(buf, pos, true);
      if (!id) return null;
      pos += id.tamanho;
      const tam = lerVint(buf, pos, false);
      if (!tam) return null;
      pos += tam.tamanho;
      const dadoInicio = pos;
      // Tamanho "desconhecido" (todos os bits 1) acontece em stream ao vivo — vai até o fim.
      const dadoFim = Math.min(fim, dadoInicio + tam.valor);

      if (id.valor === ID_SEGMENT && alvoPai === null) {
        return percorrer(dadoInicio, dadoFim, ID_SEGMENT);
      }
      if (id.valor === ID_INFO && alvoPai === ID_SEGMENT) {
        const r = percorrer(dadoInicio, dadoFim, ID_INFO);
        if (r) return r;
      }
      if (alvoPai === ID_INFO) {
        if (id.valor === ID_TIMECODE_SCALE) {
          let v = 0;
          for (let i = dadoInicio; i < dadoFim; i++) v = v * 256 + buf[i];
          if (v > 0) escala = v;
        }
        if (id.valor === ID_DURATION) {
          const n = dadoFim - dadoInicio;
          if (n === 4) duracao = buf.readFloatBE(dadoInicio);
          else if (n === 8) duracao = buf.readDoubleBE(dadoInicio);
        }
      }

      if (tam.valor === 0 || dadoFim <= pos) break;
      pos = dadoFim;
    }

    if (alvoPai === ID_INFO && duracao !== null) return { escala, duracao };
    return null;
  }

  try {
    const r = percorrer(0, buf.length, null);
    if (!r) return null;
    // Duration está em unidades de TimecodeScale (nanossegundos) — converte pra segundos.
    return (r.duracao * r.escala) / 1e9;
  } catch {
    return null;
  }
}

/** Extrai a duração de um MP4 lendo a box `mvhd` dentro de `moov`. */
function duracaoMp4(buf: Buffer): number | null {
  try {
    // `mvhd` é pequena e sempre presente; buscar a assinatura direto é mais robusto do que
    // percorrer a árvore de boxes inteira (que varia muito entre encoders).
    const idx = buf.indexOf(Buffer.from('mvhd'));
    if (idx === -1 || idx + 24 > buf.length) return null;
    const versao = buf[idx + 4];
    if (versao === 0) {
      const timescale = buf.readUInt32BE(idx + 16);
      const duration = buf.readUInt32BE(idx + 20);
      return timescale > 0 ? duration / timescale : null;
    }
    if (versao === 1 && idx + 36 <= buf.length) {
      const timescale = buf.readUInt32BE(idx + 24);
      const duration = Number(buf.readBigUInt64BE(idx + 28));
      return timescale > 0 ? duration / timescale : null;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Análise ───────────────────────────────────────────────────────────────

/**
 * Compara o arquivo recebido com a janela de tempo real da sessão de gravação.
 *
 * A checagem central é uma CONTRADIÇÃO FÍSICA, não uma heurística: o vídeo não pode ser mais
 * longo do que o tempo que passou entre o navegador pedir o token de gravação e o upload
 * chegar. Se for, esse vídeo já existia antes — foi trocado por um arquivo pré-gravado.
 *
 * @param buffer conteúdo do arquivo recebido
 * @param ehWebm true se passou na checagem de magic bytes de WebM
 * @param msDesdeInicio Date.now() - payload.iniciadoEm do token de gravação
 */
export function analisarIntegridadeVideo(
  buffer: Buffer,
  ehWebm: boolean,
  msDesdeInicio: number
): SinalIntegridade[] {
  const sinais: SinalIntegridade[] = [];

  // O gravador da tela de entrevista produz SEMPRE video/webm (MediaRecorder com mimeType
  // fixo — ver app/entrevista/[vagaId]/page.tsx). Um MP4 chegando aqui não saiu do nosso
  // gravador, veio de outro lugar.
  if (!ehWebm) {
    sinais.push({
      codigo: 'container_inesperado',
      detalhe: 'O arquivo enviado está em formato MP4. A gravação feita pela própria tela de entrevista sempre gera WebM — este vídeo foi produzido por outro programa.',
      peso: 'alto'
    });
  }

  const duracaoSeg = ehWebm ? duracaoWebm(buffer) : duracaoMp4(buffer);
  if (duracaoSeg === null) {
    // Normal e esperado em WebM de gravação ao vivo: o header é escrito antes de a gravação
    // terminar, então não há duração declarada. Ausência aqui NÃO é sinal de nada.
    return sinais;
  }

  if (ehWebm) {
    // O inverso já é sinal: um WebM COM duração declarada no header passou por remux/edição
    // (ffmpeg, editor de vídeo), porque a duração só pode ser escrita quando já se conhece o
    // arquivo inteiro. Gravação direta do navegador não tem como ter isso.
    sinais.push({
      codigo: 'metadados_de_edicao',
      detalhe: `O arquivo declara duração fixa (${duracaoSeg.toFixed(1)}s) no cabeçalho. Gravação feita ao vivo pelo navegador não grava esse dado — indica que o vídeo passou por um editor ou conversor antes do envio.`,
      peso: 'alto'
    });
  }

  const janelaSeg = msDesdeInicio / 1000;
  // Margem de 5s absorve relógio dessincronizado entre cliente e servidor e arredondamento.
  if (duracaoSeg > janelaSeg + 5) {
    sinais.push({
      codigo: 'duracao_excede_janela',
      detalhe: `O vídeo tem ${duracaoSeg.toFixed(1)}s, mas só se passaram ${janelaSeg.toFixed(1)}s desde que esta pergunta foi aberta. Um vídeo não pode ser mais longo que o tempo disponível para gravá-lo — ele já existia antes.`,
      peso: 'alto'
    });
  }

  return sinais;
}
