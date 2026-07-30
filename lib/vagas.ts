import { randomUUID } from 'crypto';
import { saveVaga } from './store';
import { generateRoteiro } from './llm';
import { FASES_PADRAO } from './types';
import type { FaseDef, Pergunta, Vaga } from './types';

export type PerguntaEntrada = { id?: string; texto: string; criterios: string; tipo?: 'principal' | 'adicional' };

/**
 * Gera o roteiro via IA e grava a vaga. Usada tanto pela criação
 * no admin local (app/api/vagas) quanto pela API externa
 * (app/api/integracoes/vagas), pra não duplicar a lógica.
 *
 * Se `perguntas` E `requisitos` vierem prontos (caso da API externa "integrar tudo"),
 * usa direto sem chamar a IA — a geração automática só entra pra preencher o que faltar.
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
}): Promise<Vaga> {
  const { cargo, senioridade, segmento, jobDescription, externalId, origem, fases, ativa } = opts;

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
    fases: fases && fases.length > 0 ? fases : FASES_PADRAO.map((f) => ({ ...f })),
    ativa: ativa ?? true,
    ...(jobDescription ? { jobDescription } : {}),
    ...(externalId ? { externalId } : {}),
    ...(origem ? { origem } : {})
  };

  await saveVaga(vaga);
  return vaga;
}
