import { randomUUID } from 'crypto';
import { saveVaga } from './store';
import { generateRoteiro } from './llm';
import { FASES_PADRAO } from './types';
import type { FaseDef, Pergunta, Vaga } from './types';

export type PerguntaEntrada = { id?: string; texto: string; criterios: string; tipo?: 'principal' | 'adicional' };

/**
 * Gera o roteiro via IA e grava a vaga. Usada tanto pela criação
 * no admin local (app/api/vagas) quanto pela API externa
 * (app/integracoes/vagas), pra não duplicar a lógica.
 *
 * Se `perguntas` E `requisitos` vierem prontos (caso da API externa "integrar tudo"
 * ou do formulário de Nova vaga), usa direto sem chamar a IA. A geração automática
 * só entra quando NENHUM dos dois foi informado.
 */
export async function criarVaga(opts: {
  cargo: string;
  senioridade: string;
  segmento: string;
  jobDescription?: string;
  externalId?: string;
  origem?: string;
  requisitos?: string[];
  perguntas?: PerguntaEntrada[];
  fases?: FaseDef[];
  ativa?: boolean;
  /** Campos do wizard */
  identificador?: string;
  responsabilidades?: string;
  formacaoAcademica?: string;
  pais?: string;
  estado?: string;
  cidade?: string;
  idiomaEntrevista?: string;
  numeroPerguntas?: number;
  dataFechamento?: string;
  numeroEntrevistas?: number;
  vagaPrivada?: boolean;
  mensagemRejeicao?: string;
  mensagemBoasVindas?: string;
  mensagemAgradecimento?: string;
}): Promise<Vaga> {
  const {
    cargo, senioridade, segmento, jobDescription, externalId, origem, fases, ativa,
    identificador, responsabilidades, formacaoAcademica, pais, estado, cidade,
    idiomaEntrevista, numeroPerguntas, dataFechamento, numeroEntrevistas,
    vagaPrivada, mensagemRejeicao, mensagemBoasVindas, mensagemAgradecimento
  } = opts;

  let requisitos = opts.requisitos;
  let perguntas: Pergunta[] | undefined = opts.perguntas?.map((p) => ({
    id: p.id || randomUUID(),
    texto: p.texto,
    criterios: p.criterios,
    tipo: p.tipo ?? 'principal'
  }));

  if (!requisitos?.length || !perguntas?.length) {
    const roteiro = await generateRoteiro(cargo, senioridade, segmento, jobDescription);
    requisitos ??= roteiro.requisitos;
    perguntas ??= roteiro.perguntas.map((p) => ({
      id: randomUUID(),
      texto: p.texto,
      criterios: p.criterios,
      tipo: p.tipo ?? 'principal'
    }));
  }

  const vaga: Vaga = {
    id: randomUUID(),
    cargo,
    senioridade,
    segmento,
    requisitos,
    perguntas,
    createdAt: new Date().toISOString(),
    version: 0,
    fases: fases && fases.length > 0 ? fases : FASES_PADRAO.map((f) => ({ ...f })),
    ativa: ativa ?? true,
    ...(jobDescription ? { jobDescription } : {}),
    ...(externalId ? { externalId } : {}),
    ...(origem ? { origem } : {}),
    ...(identificador ? { identificador } : {}),
    ...(responsabilidades ? { responsabilidades } : {}),
    ...(formacaoAcademica ? { formacaoAcademica } : {}),
    ...(pais ? { pais } : {}),
    ...(estado ? { estado } : {}),
    ...(cidade ? { cidade } : {}),
    ...(idiomaEntrevista ? { idiomaEntrevista } : {}),
    ...(numeroPerguntas != null ? { numeroPerguntas } : {}),
    ...(dataFechamento ? { dataFechamento } : {}),
    ...(numeroEntrevistas != null ? { numeroEntrevistas } : {}),
    ...(vagaPrivada != null ? { vagaPrivada } : {}),
    ...(mensagemRejeicao ? { mensagemRejeicao } : {}),
    ...(mensagemBoasVindas ? { mensagemBoasVindas } : {}),
    ...(mensagemAgradecimento ? { mensagemAgradecimento } : {})
  };

  await saveVaga(vaga);
  return vaga;
}
