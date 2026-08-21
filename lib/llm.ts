const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/** Timeout padrão pra chamadas Gemini (30s). */
const GEMINI_TIMEOUT_MS = 30_000;
/** Máximo de retentativas em erros transitórios (429, 5xx, network). */
const MAX_RETRIES = 3;
/** Tier real da conta pro gemini-2.5-flash: RPM=1000. Margem de segurança em 800. Mesmo
 *  balde do modelo usado por lib/transcribe.ts — chave de recurso igual de propósito. */
const FLASH_LIMITE_RPM = 800;
/** Nome do recurso compartilhado com lib/transcribe.ts (mesmo modelo, mesma cota da conta). */
export const RECURSO_GEMINI_FLASH = 'gemini-2.5-flash';

import { medir } from './metrics';
import { aguardarVagaGemini } from './gemini-throttle';

function geminiUrl() {
  return `${GEMINI_URL}?key=${GEMINI_API_KEY}`;
}

/** Detecta padrões de prompt injection em texto do usuário. */
function detectarPromptInjection(input: string): boolean {
  const padroes = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /ignore\s+(all\s+)?above/i,
    /you\s+are\s+now\s+(a|an)\s+/i,
    /system\s*:\s*/i,
    /act\s+as\s+if/i,
    /pretend\s+you\s+are/i,
    /disregard\s+(all\s+)?prior/i,
    /\[INST\]/i,
    /<<SYS>>/i,
    /<\|im_start\|>/i,
  ];
  return padroes.some((p) => p.test(input));
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

async function geminiGenerate(
  parts: GeminiPart[],
  opts?: { temperature?: number; maxTokens?: number; responseSchema?: object }
) {
  return medir('gemini.generate', async () => {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY nao configurada no .env.local');
    }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await aguardarVagaGemini(RECURSO_GEMINI_FLASH, FLASH_LIMITE_RPM);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
      const res = await fetch(geminiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: opts?.temperature ?? 0.7,
            maxOutputTokens: opts?.maxTokens ?? 4000,
            responseMimeType: 'application/json',
            ...(opts?.responseSchema ? { responseSchema: opts.responseSchema } : {}),
            thinkingConfig: { thinkingBudget: 0 }
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Retry em erros transitórios (429 rate limit, 5xx server error)
      if (res.status === 429 || res.status >= 500) {
        const text = await res.text().catch(() => '');
        lastError = new Error(`Gemini HTTP ${res.status}: ${text}`);
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Gemini HTTP ${res.status}: ${text}`);
      }

      const json = await res.json();
      const candidate = json?.candidates?.[0];
      const finishReason: string | undefined = candidate?.finishReason;

      const text: string = (candidate?.content?.parts ?? [])
        .map((p: any) => p?.text ?? '')
        .join('');

      if (!text.trim()) {
        const bloqueio = json?.promptFeedback?.blockReason;
        const detalhe = [
          finishReason ? `finishReason=${finishReason}` : null,
          bloqueio ? `blockReason=${bloqueio}` : null
        ]
          .filter(Boolean)
          .join(' ');

        if (finishReason === 'MAX_TOKENS') {
          throw new Error(
            `Gemini truncou a resposta antes de gerar texto (${detalhe}). Aumente maxTokens.`
          );
        }
        throw new Error(
          `Gemini retornou resposta vazia${detalhe ? ` (${detalhe})` : ''}. ` +
            `Resposta bruta: ${JSON.stringify(json).slice(0, 500)}`
        );
      }

      if (finishReason === 'MAX_TOKENS') {
        throw new Error(
          'Gemini truncou a resposta no meio (finishReason=MAX_TOKENS) — o JSON ficou incompleto. Aumente maxTokens.'
        );
      }

      return text;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;

      // Retry em erros de rede/abort (timeout)
      if (err.name === 'AbortError' || err.code === 'ECONNRESET' || err.code === 'ENOTFOUND') {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }

      // Erros não-transitórios: throw imediato
      throw err;
    }
  }

  throw lastError ?? new Error('Gemini: todas as retentativas falharam');
  }, { parteCount: parts.length, temperature: opts?.temperature });
}

function findJsonObject(text: string): string {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1);
      }
    }
  }
  throw new Error(
    `JSON object nao encontrado na resposta do Gemini. Texto recebido: ${JSON.stringify(
      text.slice(0, 500)
    )}`
  );
}

function findJsonArray(text: string): string {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === ']') {
      depth--;
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1);
      }
    }
  }
  throw new Error(
    `JSON array nao encontrado na resposta do Gemini. Texto recebido: ${JSON.stringify(
      text.slice(0, 500)
    )}`
  );
}

function parseJson<T>(text: string): T {
  const obj = findJsonObject(text);
  return JSON.parse(obj) as T;
}

function parseJsonArray<T>(text: string): T {
  const arr = findJsonArray(text);
  return JSON.parse(arr) as T;
}

/* ─── Tipos ─── */

export type RoteiroGerado = {
  requisitos: string[];
  perguntas: { texto: string; criterios: string; tipo: 'principal' | 'adicional' }[];
};

export async function generateRoteiro(
  cargo: string,
  senioridade: string,
  segmento: string,
  jobDescription?: string
): Promise<RoteiroGerado> {
  // Prompt injection check no jobDescription
  if (jobDescription && detectarPromptInjection(jobDescription)) {
    console.warn('[LLM] Prompt injection detectado no jobDescription — sanitizando');
    jobDescription = jobDescription.replace(/\b(ignore|disregard|pretend|act as if)\b/gi, '[REDACTED]');
  }

  const prompt = `Voce e um especialista em recrutamento tecnico. Crie um roteiro completo de entrevista assincrona para a vaga abaixo.

Cargo: ${cargo}
Senioridade: ${senioridade}
Segmento/empresa: ${segmento}
${jobDescription ? `\nJob Description completa (fonte de verdade — baseie requisitos e perguntas NELA, nao invente fora do que ela descreve):\n"""${jobDescription}"""\n` : ''}

Gere:
1. Uma lista de 6 a 8 requisitos tecnicos e comportamentais esperados.
2. Exatamente 5 perguntas PRINCIPAIS (tipo="principal") — obrigatorias, cobrem os requisitos mais criticos da vaga.
3. Exatamente 2 perguntas ADICIONAIS (tipo="adicional") — complementares/opcionais, aprofundam pontos secundarios ou situacoes menos frequentes.
Todas as perguntas devem ser OBJETIVAS, respondiveis em video em ate 1 minuto e 45 segundos — vao direto ao ponto, sem multiplas sub-perguntas empilhadas. Para cada pergunta, inclua criterios detalhados de avaliacao (calibrados pra uma resposta de ate 1 minuto e 45 segundos, nao exija profundidade incompativel com esse tempo).

Responda SOMENTE com um JSON valido, sem markdown, no formato exato:
{"requisitos":["requisito 1","requisito 2"],"perguntas":[{"texto":"pergunta 1","criterios":"o que uma boa resposta deve conter","tipo":"principal"}]}`;

  const raw = await geminiGenerate([{ text: prompt }], {
    temperature: 0.7,
    maxTokens: 4000
  });

  return parseJson<RoteiroGerado>(raw);
}

/* ─── Avaliacao ─── */

export type PontoAtencaoGerado = { lacuna: string; impacto: string; comoValidar: string } | null;
export type CompetenciaGerada = { nome: string; score: number };

export type AvaliacaoResposta = {
  score: number;
  feedback: string;
  pontoAtencao: PontoAtencaoGerado;
  estaLendo: boolean;
  confiancaLeitura: number;
  qualidadeDiscurso: {
    naturalidade: number;
    personalizacao: number;
    complexidade: number;
    padroesLinguisticos: number;
    contexto: number;
  };
  qualidadeConteudo: { profundidade: number; estrutura: number; exemplos: number };
  competenciasEssenciais: CompetenciaGerada[];
  competenciasAdicionais: CompetenciaGerada[];
  avaliacaoIdioma?: { score: number; nivel: string; feedback: string } | null;
};

const CALIBRAGEM_SENIORIDADE: Record<string, string> = {
  estagio:
    'Estagio/Trainee: nota 6-7 ja representa potencial solido para o nivel; nota 9-10 deve ser raro (excepcional para quem esta comecando).',
  junior:
    'Junior: nota 6-7 ja representa boa aderencia de entrada; nota 9-10 deve ser raro. Nao penalize falta de autonomia estrategica.',
  pleno:
    'Pleno: nota 6-7 representa aderencia funcional ao cargo; nota 8 representa autonomia clara; 9-10 representa dominio consolidado e recorrente.',
  senior:
    'Senior: nota 6 representa aderencia parcial (abaixo do esperado para o nivel); nota 8 representa autonomia madura; 9-10 representa referencia tecnica/estrategica.',
  especialista:
    'Especialista: a regua e mais exigente — nota 6 ja e insuficiente se faltar profundidade tecnica; 9-10 exige dominio de ponta e visao de impacto no negocio.'
};

function calibragemPara(senioridade: string): string {
  const chave = senioridade
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return CALIBRAGEM_SENIORIDADE[chave] ?? CALIBRAGEM_SENIORIDADE.pleno;
}

const COMPETENCIA_ITEM_SCHEMA = {
  type: 'OBJECT',
  properties: {
    nome: { type: 'STRING' },
    score: { type: 'NUMBER' }
  },
  required: ['nome', 'score']
};

const AVALIACAO_SCHEMA = {
  type: 'OBJECT',
  properties: {
    score: { type: 'NUMBER' },
    feedback: { type: 'STRING' },
    pontoAtencao: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        lacuna: { type: 'STRING' },
        impacto: { type: 'STRING' },
        comoValidar: { type: 'STRING' }
      },
      required: ['lacuna', 'impacto', 'comoValidar']
    },
    estaLendo: { type: 'BOOLEAN' },
    confiancaLeitura: { type: 'NUMBER' },
    qualidadeDiscurso: {
      type: 'OBJECT',
      properties: {
        naturalidade: { type: 'NUMBER' },
        personalizacao: { type: 'NUMBER' },
        complexidade: { type: 'NUMBER' },
        padroesLinguisticos: { type: 'NUMBER' },
        contexto: { type: 'NUMBER' }
      },
      required: ['naturalidade', 'personalizacao', 'complexidade', 'padroesLinguisticos', 'contexto']
    },
    qualidadeConteudo: {
      type: 'OBJECT',
      properties: {
        profundidade: { type: 'NUMBER' },
        estrutura: { type: 'NUMBER' },
        exemplos: { type: 'NUMBER' }
      },
      required: ['profundidade', 'estrutura', 'exemplos']
    },
    competenciasEssenciais: { type: 'ARRAY', items: COMPETENCIA_ITEM_SCHEMA },
    competenciasAdicionais: { type: 'ARRAY', items: COMPETENCIA_ITEM_SCHEMA },
    avaliacaoIdioma: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        score: { type: 'NUMBER' },
        nivel: { type: 'STRING' },
        feedback: { type: 'STRING' }
      },
      required: ['score', 'nivel', 'feedback']
    }
  },
  required: [
    'score',
    'feedback',
    'pontoAtencao',
    'estaLendo',
    'confiancaLeitura',
    'qualidadeDiscurso',
    'qualidadeConteudo',
    'competenciasEssenciais',
    'competenciasAdicionais'
  ]
};

export async function avaliarResposta(
  pergunta: string,
  criterios: string,
  transcricao: string,
  senioridade: string,
  requisitosVaga: string[],
  frames?: { frameBase64: string; timestamp: string }[],
  curriculoTexto?: string,
  jobDescription?: string,
  avaliarIdioma?: boolean
): Promise<AvaliacaoResposta> {
  // Prompt injection checks
  if (jobDescription && detectarPromptInjection(jobDescription)) {
    console.warn('[LLM] Prompt injection detectado no jobDescription — sanitizando');
    jobDescription = jobDescription.replace(/\b(ignore|disregard|pretend|act as if)\b/gi, '[REDACTED]');
  }
  if (transcricao && detectarPromptInjection(transcricao)) {
    console.warn('[LLM] Prompt injection detectado na transcrição — sanitizando');
    transcricao = transcricao.replace(/\b(ignore|disregard|pretend|act as if)\b/gi, '[REDACTED]');
  }
  const hasFrames = frames && frames.length > 0;
  const hasCurriculo = curriculoTexto && curriculoTexto.trim().length > 0;
  const hasJD = jobDescription && jobDescription.trim().length > 0;

  const textPart: GeminiPart = {
    text: `Voce e um avaliador tecnico de entrevistas em video. Avalie a resposta abaixo com rigor,
proporcionalidade e calibragem pela senioridade da vaga.

Pergunta: ${pergunta}
Criterios de avaliacao: ${criterios}
Requisitos formais da vaga (use como base p/ competenciasEssenciais): ${requisitosVaga.join('; ')}
${hasJD ? `\nJob Description completa (fonte de verdade — priorize sobre a lista de requisitos quando houver conflito):\n"""${jobDescription!.trim().slice(0, 3000)}"""\n` : ''}
${hasCurriculo ? `\nCurriculo/LinkedIn do candidato (use como contexto adicional — verifique se a experiencia declarada na resposta e coerente com o perfil):\n"""${curriculoTexto.trim().slice(0, 3000)}"""\n` : ''}

Transcricao da resposta do candidato:
"""
${transcricao || '(resposta vazia)'}
"""

CALIBRAGEM POR SENIORIDADE (aplique antes de pontuar):
${calibragemPara(senioridade)}
Nao penalize a ausencia de uma ferramenta/termo especifico se houver raciocinio ou
experiencia transferivel equivalente. Nao seja excessivamente critico — a regua e
proporcional ao nivel da vaga, nao um padrao absoluto de excelencia.

PROIBIDO usar frases genericas isoladas como "faltou aprofundar", "validar na pratica"
ou "nao houve evidencia suficiente" sem explicar EXATAMENTE o que faltou.

Responda:
1. score (0 a 10, decimal permitido): calibrado pela senioridade acima.
2. feedback: 2-4 frases especificas, citando elementos concretos da transcricao (ou a
   ausencia especifica deles) — nunca generico.
3. pontoAtencao: se houver lacuna relevante, objeto com "lacuna" (o que faltou, especifico),
   "impacto" (risco/consequencia concreta para a vaga) e "comoValidar" (acao pratica pra
   validar na proxima etapa do processo). Use null se a resposta nao tiver lacuna relevante.
${hasFrames ? `4. Nas imagens (frames capturados em momentos diferentes da resposta), avalie se o candidato
   PARECE estar lendo um texto pronto. Sinais a procurar, em ordem de peso:
   (a) olhar consistentemente DESVIADO da camera na MESMA direcao nos varios frames (ler de um
       segundo monitor, notebook ao lado ou papel na mesa produz esse padrao fixo);
   (b) olhar apontado para BAIXO de forma repetida (celular/papel no colo ou na mesa);
   (c) movimento ocular horizontal de varredura, tipico de quem percorre linhas de texto;
   (d) rosto estatico/inexpressivo com pouca gesticulacao, expressao "vidrada";
   (e) reflexo de tela visivel em oculos, quando houver.
   ATENCAO a falsos positivos: olhar para cima/para o lado brevemente ao PENSAR e normal e NAO
   e leitura; uma unica ocorrencia isolada num frame nao basta. So marque estaLendo=true com
   sinal consistente em mais de um frame. Em confiancaLeitura (0-1) reflita honestamente a
   incerteza — frames escuros, de baixa qualidade ou com o rosto parcialmente fora do
   enquadramento devem baixar a confianca, nao inventar certeza.` : '4. Sem imagens disponiveis: use estaLendo=false e confiancaLeitura=0.'}
5. qualidadeDiscurso (0-100 cada, SOMENTE forma/linguagem, nao conteudo tecnico):
   naturalidade (espontaneidade vs decorado), personalizacao (menciona casos/situacoes reais
   vs generico), complexidade (sofisticacao do raciocinio), padroesLinguisticos (clareza/coesao),
   contexto (referencias concretas ao cenario da pergunta).
6. qualidadeConteudo (0-100 cada): profundidade, estrutura, exemplos praticos.
7. competenciasEssenciais: 2-4 itens da lista de requisitos formais da vaga que ESTA pergunta
   testa diretamente — cada um com "nome" e "score" 0-100 de ADERENCIA DEMONSTRADA (100=demonstrou
   plenamente, 0=nao demonstrou nada). O score deve ser logicamente consistente com o feedback e
   pontoAtencao acima — nunca de aderencia alta a algo listado como lacuna.
8. competenciasAdicionais: 0-3 competencias reveladas pelo contexto da pergunta/resposta que NAO
   estao na lista formal de requisitos, mesma escala de aderencia.
${avaliarIdioma ? `9. avaliacaoIdioma: avalie o nivel de idioma do candidato com base na transcricao (se a resposta contem termos tecnicos em ingles, se a fluencia e boa, se ha erros gramaticais, etc). Retorne: score (0-10), nivel (basico/intermediario/avancado/fluido/nativo), feedback (1-2 frases sobre o nivel). Se o candidato nao demonstrar conhecimento de idioma, retorne null.` : ''}

Antes de responder, confira internamente: a nota esta calibrada pela senioridade? O
feedback cita algo concreto da transcricao? Os scores de competencia sao coerentes com o
feedback e o pontoAtencao (nunca contraditorios)? Nenhum campo generico ou vazio?`
  };

  const parts: GeminiPart[] = [textPart];

  if (hasFrames) {
    for (const f of frames!) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: f.frameBase64
        }
      });
    }
  }

  const raw = await geminiGenerate(parts, {
    temperature: 0.3,
    maxTokens: 3000,
    responseSchema: AVALIACAO_SCHEMA
  });

  return parseJson<AvaliacaoResposta>(raw);
}

/* ─── Analise de perguntas ─── */

export type AnalisePergunta = {
  indice: number;
  notaTexto: number;
  notaCriterios: number;
  feedbackTexto: string;
  feedbackCriterios: string;
  sugestaoMelhoria: string | null;
};

export async function analisarPerguntas(
  perguntas: { texto: string; criterios: string }[],
  cargo?: string,
  senioridade?: string,
  segmento?: string
): Promise<AnalisePergunta[]> {
  const prompt = `Voce e um especialista em recrutamento tecnico. Analise cada pergunta de entrevista abaixo e avalie a qualidade do texto e dos criterios.

Contexto da vaga:
- Cargo: ${cargo || 'Nao informado'}
- Senioridade: ${senioridade || 'Nao informado'}
- Segmento: ${segmento || 'Nao informado'}

Para cada pergunta avalie:
1. texto: clareza, especificidade, adequacao para video de 2min
2. criterios: sao especificos, mensuraveis e alinhados?
3. Nota 0-10 para cada campo
4. Sugira melhoria quando nota < 8 (ou null se estiver bom)

Perguntas:
${perguntas.map((p, i) => `[${i + 1}]
Texto: ${p.texto}
Criterios: ${p.criterios}`).join('\n\n')}

Responda SOMENTE com JSON array:
[{"indice":1,"notaTexto":8.5,"notaCriterios":7.0,"feedbackTexto":"...","feedbackCriterios":"...","sugestaoMelhoria":"..."}]`;

  const raw = await geminiGenerate([{ text: prompt }], {
    temperature: 0.3,
    maxTokens: 8000
  });

  return parseJsonArray<AnalisePergunta[]>(raw);
}

/* ─── Parecer final (síntese consolidada, no formato de relatório de avaliação) ─── */

export type ParecerGerado = {
  sinteseExecutiva: string;
  porPergunta: { perguntaId: string; analise: string; pontosFortes: string[]; pontosMelhoria: string[] }[];
  conclusao: string;
  recomendacao: 'avancar' | 'analisar_com_cautela' | 'reprovar';
};

const PARECER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sinteseExecutiva: { type: 'STRING' },
    porPergunta: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          perguntaId: { type: 'STRING' },
          analise: { type: 'STRING' },
          pontosFortes: { type: 'ARRAY', items: { type: 'STRING' } },
          pontosMelhoria: { type: 'ARRAY', items: { type: 'STRING' } }
        },
        required: ['perguntaId', 'analise', 'pontosFortes', 'pontosMelhoria']
      }
    },
    conclusao: { type: 'STRING' },
    recomendacao: { type: 'STRING', enum: ['avancar', 'analisar_com_cautela', 'reprovar'] }
  },
  required: ['sinteseExecutiva', 'porPergunta', 'conclusao', 'recomendacao']
};

export async function gerarParecer(
  vaga: {
    cargo: string;
    senioridade: string;
    segmento: string;
    requisitos: string[];
    jobDescription?: string;
  },
  respostas: { perguntaId: string; texto: string; transcricao: string; score: number; feedback: string }[],
  curriculoTexto?: string
): Promise<ParecerGerado> {
  const fonteRequisitos = vaga.jobDescription
    ? `Job Description completa (fonte de verdade — priorize sobre a lista de requisitos abaixo em caso de conflito):\n"""${vaga.jobDescription}"""`
    : `Requisitos esperados: ${vaga.requisitos.join('; ')}`;

  const contextoCandidato = curriculoTexto && curriculoTexto.trim().length > 0
    ? `\nCurriculo/LinkedIn do candidato (use como contexto — verifique coerência entre experiencia declarada e respostas):\n"""${curriculoTexto.trim().slice(0, 3000)}"""\n`
    : '';

  const prompt = `Voce e um avaliador senior de recrutamento. Com base nas respostas ja avaliadas de uma entrevista assincrona, produza um PARECER FINAL consolidado, calibrado pela senioridade da vaga.

Vaga: ${vaga.cargo} (${vaga.senioridade}) — ${vaga.segmento}
${fonteRequisitos}
${contextoCandidato}

Respostas ja avaliadas individualmente (nota 0-10 e feedback tecnico ja existentes — use como insumo, nao repita literalmente):
${respostas
  .map(
    (r, i) => `[PERGUNTA ${i + 1}] id=${r.perguntaId}
Pergunta: ${r.texto}
Transcricao: """${r.transcricao || '(vazia)'}"""
Nota individual: ${r.score}
Feedback individual: ${r.feedback}`
  )
  .join('\n\n')}

CALIBRAGEM: aplique a mesma logica de proporcionalidade por senioridade usada na
avaliacao individual — nao seja mais rigido nem mais brando no parecer final do que
foi respota a respota. Nao seja excessivamente critico.

Cada secao tem foco proprio e NAO pode repetir a mesma frase-base de outra:
- sinteseExecutiva: panorama geral do alinhamento com a vaga (nao repete detalhe de
  pergunta especifica).
- porPergunta[].analise: o que E especifico daquela pergunta (nao repete a sintese).
- conclusao: recomendacao pratica de proximo passo — estrutura obrigatoria: o que
  desenvolver/validar + por que isso importa pra vaga + como fazer isso na proxima
  etapa do processo seletivo. Proibido usar recomendacao generica tipo "acompanhar
  evolucao" ou "validar em contexto pratico" sem detalhar a acao concreta.

Gere:
1. sinteseExecutiva (3-5 frases).
2. porPergunta: para cada pergunta (use o mesmo "id" informado), analise + pontosFortes + pontosMelhoria (pode ser array vazio).
3. conclusao seguindo a estrutura obrigatoria acima.
4. recomendacao: "avancar" (bom alinhamento), "analisar_com_cautela" (potencial mas com lacunas relevantes) ou "reprovar" (desalinhado da vaga).

Antes de responder, confira: alguma frase se repete entre sinteseExecutiva e conclusao?
A conclusao segue o-que/por-que/como? A recomendacao e coerente com o texto?`;

  const raw = await geminiGenerate([{ text: prompt }], {
    temperature: 0.4,
    maxTokens: 4000,
    responseSchema: PARECER_SCHEMA
  });

  return parseJson<ParecerGerado>(raw);
}

/* ─── Geração de descrição da vaga (etapa 2 do wizard) ─── */

export type DescricaoVagaGerada = {
  jobDescription: string;
  responsabilidades: string;
  requisitos: string[];
};

export async function gerarDescricaoVaga(opts: {
  cargo: string;
  senioridade: string;
  segmento: string;
  formacaoAcademica?: string;
  idiomaEntrevista?: string;
  pais?: string;
  estado?: string;
  cidade?: string;
}): Promise<DescricaoVagaGerada> {
  const prompt = `Voce e um especialista em recrutamento tecnico. Gere uma descricao completa para a vaga abaixo.

Cargo: ${opts.cargo}
Senioridade: ${opts.senioridade}
Segmento/empresa: ${opts.segmento}
${opts.formacaoAcademica ? `Formacao academica: ${opts.formacaoAcademica}` : ''}
${opts.idiomaEntrevista ? `Idioma da entrevista: ${opts.idiomaEntrevista}` : ''}
${opts.pais ? `Pais: ${opts.pais}${opts.estado ? ` / ${opts.estado}` : ''}${opts.cidade ? ` / ${opts.cidade}` : ''}` : ''}

Gere:
1. jobDescription: Descricao da vaga (500-1000 caracteres) — visao geral, responsabilidades e requisitos da posicao.
2. responsabilidades: Lista detalhada das responsabilidades do cargo (500-1000 caracteres).
3. requisitos: Lista de 6 a 8 requisitos tecnicos e comportamentais obrigatorios.

Responda SOMENTE com JSON valido:
{"jobDescription":"...","responsabilidades":"...","requisitos":["req 1","req 2"]}`;

  const raw = await geminiGenerate([{ text: prompt }], {
    temperature: 0.7,
    maxTokens: 4000
  });

  return parseJson<DescricaoVagaGerada>(raw);
}

/* ─── Geração de perguntas (etapa 3 do wizard) ─── */

export async function gerarPerguntasVaga(opts: {
  cargo: string;
  senioridade: string;
  segmento: string;
  jobDescription?: string;
  responsabilidades?: string;
  requisitos: string[];
  numeroPerguntas: number;
}): Promise<{ texto: string; criterios: string; tipo: 'principal' | 'adicional' }[]> {
  const { cargo, senioridade, segmento, jobDescription, responsabilidades, requisitos, numeroPerguntas } = opts;

  const prompt = `Voce e um especialista em recrutamento tecnico. Gere exatamente ${numeroPerguntas} perguntas de entrevista assincrona para a vaga abaixo.

Cargo: ${cargo}
Senioridade: ${senioridade}
Segmento: ${segmento}
${jobDescription ? `\nJob Description:\n"""${jobDescription}"""\n` : ''}
${responsabilidades ? `\nResponsabilidades:\n"""${responsabilidades}"""\n` : ''}
Requisitos: ${requisitos.join('; ')}

Gere exatamente ${numeroPerguntas} perguntas. Todas devem ser CURTAS e OBJETIVAS, respondiveis em video em ate 1 minuto — vao direto ao ponto, sem multiplas sub-perguntas empilhadas. Para cada pergunta, inclua criterios detalhados de avaliacao (calibrados pra uma resposta de ate 1 minuto, nao exija profundidade incompativel com esse tempo).
As primeiras ${Math.ceil(numeroPerguntas * 0.7)} perguntas devem ser PRINCIPAIS (tipo="principal") — cobrem os requisitos mais criticos.
As demais devem ser ADICIONAIS (tipo="adicional") — complementares/opcionais.

Responda SOMENTE com JSON array:
[{"texto":"pergunta 1","criterios":"o que uma boa resposta deve conter","tipo":"principal"}]`;

  const raw = await geminiGenerate([{ text: prompt }], {
    temperature: 0.7,
    maxTokens: 4000
  });

  return parseJsonArray<{ texto: string; criterios: string; tipo: 'principal' | 'adicional' }[]>(raw);
}
