const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

function geminiUrl() {
  return `${GEMINI_URL}?key=${GEMINI_API_KEY}`;
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

async function geminiGenerate(
  parts: GeminiPart[],
  opts?: { temperature?: number; maxTokens?: number; responseSchema?: object }
) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY nao configurada no .env.local');
  }
  const res = await fetch(geminiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: opts?.temperature ?? 0.7,
        maxOutputTokens: opts?.maxTokens ?? 4000,
        responseMimeType: 'application/json',
        // Guardrail estrutural: o schema forca o formato no nivel do decoding do
        // modelo (nao so via instrucao no prompt) — reduz drasticamente JSON
        // malformado/campo ausente sem depender do modelo "obedecer" o prompt.
        ...(opts?.responseSchema ? { responseSchema: opts.responseSchema } : {}),
        // gemini-2.5-flash e modelo de raciocinio: sem isto, o "thinking"
        // consome o orcamento de tokens e a resposta volta VAZIA.
        thinkingConfig: { thinkingBudget: 0 }
      }
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  const candidate = json?.candidates?.[0];
  const finishReason: string | undefined = candidate?.finishReason;

  // Junta todas as parts (a resposta nem sempre vem numa unica).
  const text: string = (candidate?.content?.parts ?? [])
    .map((p: any) => p?.text ?? '')
    .join('');

  if (!text.trim()) {
    // Erro acionavel em vez do generico "JSON nao encontrado".
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
  const prompt = `Voce e um especialista em recrutamento tecnico. Crie um roteiro completo de entrevista assincrona para a vaga abaixo.

Cargo: ${cargo}
Senioridade: ${senioridade}
Segmento/empresa: ${segmento}
${jobDescription ? `\nJob Description completa (fonte de verdade — baseie requisitos e perguntas NELA, nao invente fora do que ela descreve):\n"""${jobDescription}"""\n` : ''}

Gere:
1. Uma lista de 6 a 8 requisitos tecnicos e comportamentais esperados.
2. Exatamente 5 perguntas PRINCIPAIS (tipo="principal") — obrigatorias, cobrem os requisitos mais criticos da vaga.
3. Exatamente 2 perguntas ADICIONAIS (tipo="adicional") — complementares/opcionais, aprofundam pontos secundarios ou situacoes menos frequentes.
Todas as perguntas devem ser adequadas a resposta em video de ate 2-3 minutos. Para cada pergunta, inclua criterios detalhados de avaliacao.

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
    competenciasAdicionais: { type: 'ARRAY', items: COMPETENCIA_ITEM_SCHEMA }
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
  frames?: { frameBase64: string; timestamp: string }[]
): Promise<AvaliacaoResposta> {
  const hasFrames = frames && frames.length > 0;

  const textPart: GeminiPart = {
    text: `Voce e um avaliador tecnico de entrevistas em video. Avalie a resposta abaixo com rigor,
proporcionalidade e calibragem pela senioridade da vaga.

Pergunta: ${pergunta}
Criterios de avaliacao: ${criterios}
Requisitos formais da vaga (use como base p/ competenciasEssenciais): ${requisitosVaga.join('; ')}

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
${hasFrames ? '4. Nas imagens do video, analise se o candidato PARECE estar lendo um script/teleprompter (olhos vidrados, movimento ocular repetitivo, falta de contato visual com a camera) — preencha estaLendo/confiancaLeitura (0-1). Sem imagens, use estaLendo=false e confiancaLeitura=0.' : '4. Sem imagens disponiveis: use estaLendo=false e confiancaLeitura=0.'}
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
  respostas: { perguntaId: string; texto: string; transcricao: string; score: number; feedback: string }[]
): Promise<ParecerGerado> {
  const fonteRequisitos = vaga.jobDescription
    ? `Job Description completa (fonte de verdade — priorize sobre a lista de requisitos abaixo em caso de conflito):\n"""${vaga.jobDescription}"""`
    : `Requisitos esperados: ${vaga.requisitos.join('; ')}`;

  const prompt = `Voce e um avaliador senior de recrutamento. Com base nas respostas ja avaliadas de uma entrevista assincrona, produza um PARECER FINAL consolidado, calibrado pela senioridade da vaga.

Vaga: ${vaga.cargo} (${vaga.senioridade}) — ${vaga.segmento}
${fonteRequisitos}

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
