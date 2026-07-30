import { randomUUID } from 'crypto';
import { saveVaga } from './store';
import { generateRoteiro } from './llm';
import { FASES_PADRAO } from './types';
import type { Vaga } from './types';

/**
 * Gera o roteiro via IA e grava a vaga. Usada tanto pela criação
 * no admin local (app/api/vagas) quanto pela API externa
 * (app/api/integracoes/vagas), pra não duplicar a lógica.
 */
export async function criarVaga(opts: {
  cargo: string;
  senioridade: string;
  segmento: string;
  jobDescription?: string;
  externalId?: string;
  origem?: string;
}): Promise<Vaga> {
  const { cargo, senioridade, segmento, jobDescription, externalId, origem } = opts;
  const roteiro = await generateRoteiro(cargo, senioridade, segmento, jobDescription);

  const vaga: Vaga = {
    id: randomUUID(),
    cargo,
    senioridade,
    segmento,
    requisitos: roteiro.requisitos,
    perguntas: roteiro.perguntas.map((p) => ({
      id: randomUUID(),
      texto: p.texto,
      criterios: p.criterios,
      tipo: p.tipo ?? 'principal'
    })),
    createdAt: new Date().toISOString(),
    fases: FASES_PADRAO.map((f) => ({ ...f })),
    ...(jobDescription ? { jobDescription } : {}),
    ...(externalId ? { externalId } : {}),
    ...(origem ? { origem } : {})
  };

  await saveVaga(vaga);
  return vaga;
}
