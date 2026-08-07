export type Pergunta = {
  id: string;
  texto: string;
  criterios: string;
  /** Ausente = tratado como 'principal'. Adicionais são opcionais no fluxo do candidato. */
  tipo?: 'principal' | 'adicional';
  /** URL pública (R2) do áudio TTS já sintetizado desta pergunta — evita chamar a API Gemini a cada "Ouvir pergunta". */
  audioUrl?: string;
};

export type Vaga = {
  id: string;
  cargo: string;
  senioridade: string;
  segmento: string;
  requisitos: string[];
  perguntas: Pergunta[];
  createdAt: string;
  /** ID do registro correspondente num sistema externo (ex: card do Pipefy) — usado para correlação, não é gerado aqui. */
  externalId?: string;
  /** Nome do sistema externo que criou a vaga via API (ex: "pipefy", "n8n"). Ausente = criada pelo admin local. */
  origem?: string;
  /** Colunas do kanban de seleção desta vaga — editável, ordem = ordem das colunas. */
  fases: FaseDef[];
  /** Job Description completa (texto livre) enviada pelo recrutador. Quando presente, é a fonte de verdade usada pela IA para gerar/avaliar contra a vaga — tem prioridade sobre `requisitos`. */
  jobDescription?: string;
  /** Ausente = tratado como true (vagas antigas). false = fechada — some de /entrevista, /vagas/publicas e da criação de novas candidaturas. */
  ativa?: boolean;
};

/** Cor semântica de uma fase — mapeia pra um token fixo da paleta V4 (nunca hex livre). */
export type CorFase = 'neutro' | 'atencao' | 'sucesso' | 'perigo';

/** Uma coluna do kanban de seleção. `id` é referenciado por `Candidatura.fase`. */
export type FaseDef = {
  id: string;
  nome: string;
  cor: CorFase;
};

/** Fases padrão semeadas em toda vaga nova; também usadas para normalizar vagas antigas sem `fases`. */
export const FASES_PADRAO: FaseDef[] = [
  { id: 'triagem', nome: 'Triagem', cor: 'neutro' },
  { id: 'entrevista', nome: 'Entrevista', cor: 'atencao' },
  { id: 'aprovado', nome: 'Aprovado', cor: 'sucesso' },
  { id: 'reprovado', nome: 'Reprovado', cor: 'perigo' }
];

/** Lacuna estruturada em 3 partes — o formato reduz genérico tipo "aprofundar na prática". */
export type PontoAtencao = {
  lacuna: string;
  impacto: string;
  comoValidar: string;
};

/** 0-100. Métricas de forma do discurso (não de conteúdo técnico) — usadas na análise granular por pergunta. */
export type QualidadeDiscurso = {
  naturalidade: number;
  personalizacao: number;
  complexidade: number;
  padroesLinguisticos: number;
  contexto: number;
};

/** 0-100. Métricas de conteúdo da resposta. */
export type QualidadeConteudo = {
  profundidade: number;
  estrutura: number;
  exemplos: number;
};

/** Competência testada nesta resposta específica, com score de aderência 0-100. */
export type CompetenciaAvaliada = {
  nome: string;
  score: number;
};

export type Resposta = {
  perguntaId: string;
  videoPath: string;
  transcricao: string;
  score: number;
  feedback: string;
  estaLendo?: boolean;
  confiancaLeitura?: number;
  /** true logo após o upload, enquanto transcrição/avaliação rodam em background (vídeo já está salvo). */
  avaliando?: boolean;
  /** null quando não há lacuna relevante nesta resposta. */
  pontoAtencao?: PontoAtencao | null;
  qualidadeDiscurso?: QualidadeDiscurso;
  qualidadeConteudo?: QualidadeConteudo;
  /** Requisitos formais da vaga diretamente testados por esta pergunta. */
  competenciasEssenciais?: CompetenciaAvaliada[];
  /** Competências implícitas reveladas pela resposta, fora da lista formal de requisitos. */
  competenciasAdicionais?: CompetenciaAvaliada[];
};

/** Comentário interno do recrutador sobre a candidatura — não visível ao candidato. */
export type NotaInterna = {
  id: string;
  texto: string;
  criadoEm: string;
};

/** Análise consolidada por pergunta dentro do parecer final (distinta do feedback bruto de `Resposta`). */
export type ParecerPergunta = {
  perguntaId: string;
  analise: string;
  pontosFortes: string[];
  pontosMelhoria: string[];
};

/** Parecer final gerado pela IA a partir de todas as respostas já avaliadas — cacheado na candidatura. */
export type Parecer = {
  sinteseExecutiva: string;
  porPergunta: ParecerPergunta[];
  conclusao: string;
  recomendacao: 'avancar' | 'analisar_com_cautela' | 'reprovar';
  scoreGeral: number;
  geradoEm: string;
};

export type Candidatura = {
  id: string;
  vagaId: string;
  nome: string;
  email: string;
  status: 'em_andamento' | 'concluida';
  /** ID de uma FaseDef da vaga (Vaga.fases). Candidaturas antigas sem este campo são tratadas como 'triagem'. */
  fase: string;
  respostas: Resposta[];
  scoreMedio: number | null;
  createdAt: string;
  /** Campos opcionais de ATS, preenchidos pelo candidato no formulário inicial. */
  linkedin?: string;
  telefone?: string;
  pretensaoSalarial?: string;
  /** Caminho público do currículo enviado (PDF), ex: /uploads/<id>/curriculo.pdf */
  curriculoPath?: string;
  /** Comentários do recrutador, mais recente por último. */
  notasInternas?: NotaInterna[];
  /** Parecer consolidado (síntese + conclusão), gerado sob demanda e cacheado aqui até a próxima resposta. */
  parecer?: Parecer;
  /** Email do talent responsável por este candidato (atribuição manual). */
  talentResponsavel?: string;
  /** ─── Filtros avançados ─── */
  segmento?: string;
  nivelProfissional?: string;
  formacao?: string;
  pais?: string;
  estado?: string;
  cidade?: string;
  idioma?: string;
};
