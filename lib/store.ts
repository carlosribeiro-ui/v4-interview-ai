import type { Vaga, Candidatura } from './types';
import { FASES_PADRAO } from './types';
import { getDb } from './mongodb';

async function vagasCollection() {
  const db = await getDb();
  return db.collection<Vaga>('vagas');
}

async function candidaturasCollection() {
  const db = await getDb();
  return db.collection<Candidatura>('candidaturas');
}

/** Vagas gravadas antes do kanban de fases/do campo `ativa` existirem — aplica os defaults. */
function normalizarFases(v: Vaga): Vaga {
  const { _id, ...resto } = v as Vaga & { _id?: unknown };
  const comFases = resto.fases && resto.fases.length > 0 ? resto : { ...resto, fases: FASES_PADRAO };
  return typeof comFases.ativa === 'boolean' ? comFases : { ...comFases, ativa: true };
}

/** Candidaturas gravadas antes do pipeline de fases existir não têm o campo — assume 'triagem'. */
function normalizarFase(c: Candidatura): Candidatura {
  const { _id, ...resto } = c as Candidatura & { _id?: unknown };
  return resto.fase ? resto : { ...resto, fase: 'triagem' };
}

export async function getVagas(): Promise<Vaga[]> {
  const col = await vagasCollection();
  const vagas = await col.find({}).toArray();
  return vagas.map(normalizarFases).sort((a, b) => {
    // Prioritárias primeiro
    if (a.prioritaria && !b.prioritaria) return -1;
    if (!a.prioritaria && b.prioritaria) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export async function getVaga(id: string): Promise<Vaga | undefined> {
  const col = await vagasCollection();
  const v = await col.findOne({ id });
  return v ? normalizarFases(v) : undefined;
}

export async function saveVaga(vaga: Vaga): Promise<void> {
  const col = await vagasCollection();
  await col.replaceOne({ id: vaga.id }, vaga, { upsert: true });
}

/** Remove a vaga e todas as candidaturas dela — não há como recuperar depois. */
export async function deleteVaga(id: string): Promise<void> {
  const vagas = await vagasCollection();
  const candidaturas = await candidaturasCollection();
  await candidaturas.deleteMany({ vagaId: id });
  await vagas.deleteOne({ id });
}

export async function getCandidaturas(vagaId?: string): Promise<Candidatura[]> {
  const col = await candidaturasCollection();
  const all = await col.find(vagaId ? { vagaId } : {}).toArray();
  return all.map(normalizarFase);
}

export async function getCandidatura(id: string): Promise<Candidatura | undefined> {
  const col = await candidaturasCollection();
  const c = await col.findOne({ id });
  return c ? normalizarFase(c) : undefined;
}

/**
 * Busca a candidatura existente de um e-mail numa vaga (case-insensitive).
 * Base da retomada: o mesmo candidato nunca deve gerar duas candidaturas.
 */
export async function findCandidaturaPorEmail(
  vagaId: string,
  email: string
): Promise<Candidatura | undefined> {
  const alvo = email.trim().toLowerCase();
  const col = await candidaturasCollection();
  const candidatas = await col.find({ vagaId }).toArray();
  const c = candidatas.find((c) => c.email.trim().toLowerCase() === alvo);
  return c ? normalizarFase(c) : undefined;
}

export async function saveCandidatura(candidatura: Candidatura): Promise<void> {
  const col = await candidaturasCollection();
  await col.replaceOne({ id: candidatura.id }, candidatura, { upsert: true });
}

export async function deleteCandidatura(id: string): Promise<void> {
  const col = await candidaturasCollection();
  await col.deleteOne({ id });
}
