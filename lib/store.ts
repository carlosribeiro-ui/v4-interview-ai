import type { Vaga, Candidatura, Resposta, NotaInterna, Parecer } from './types';
import { FASES_PADRAO } from './types';
import { getDb } from './mongodb';
import { cacheGet, cacheSet, cacheDel, cacheDelPrefix } from './cache';
import type { Collection, Filter, UpdateFilter } from 'mongodb';

// ─── Collections ───────────────────────────────────────────────────────────

async function vagasCollection(): Promise<Collection<Vaga>> {
  const db = await getDb();
  return db.collection<Vaga>('vagas');
}

async function candidaturasCollection(): Promise<Collection<Candidatura>> {
  const db = await getDb();
  return db.collection<Candidatura>('candidaturas');
}

// ─── Indexes (rodam uma vez, idempotentes) ──────────────────────────────────

let indexesEnsured = false;

export async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  try {
    const col = await candidaturasCollection();
    // Unique: uma candidatura por (vagaId, email) — previne duplicatas
    await col.createIndex({ vagaId: 1, email: 1 }, { unique: true, sparse: true });
    // Performance: buscas por vaga e por status
    await col.createIndex({ vagaId: 1, status: 1 });
    await col.createIndex({ status: 1 });
    indexesEnsured = true;
  } catch (err) {
    console.error('[Store] Falha ao criar indexes:', err);
  }
}

// ─── Normalização ──────────────────────────────────────────────────────────

/** Vagas gravadas antes do kanban de fases/do campo `ativa` existirem — aplica os defaults. */
function normalizarFases(v: Vaga): Vaga {
  const { _id, ...resto } = v as Vaga & { _id?: unknown };
  const comFases = resto.fases && resto.fases.length > 0 ? resto : { ...resto, fases: FASES_PADRAO };
  const comAtiva = typeof comFases.ativa === 'boolean' ? comFases : { ...comFases, ativa: true };
  return typeof comAtiva.version === 'number' ? comAtiva : { ...comAtiva, version: 0 };
}

/** Candidaturas gravadas antes do pipeline de fases existir não têm o campo — assume 'triagem'. */
function normalizarFase(c: Candidatura): Candidatura {
  const { _id, ...resto } = c as Candidatura & { _id?: unknown };
  const comFase = resto.fase ? resto : { ...resto, fase: 'triagem' };
  return typeof comFase.version === 'number' ? comFase : { ...comFase, version: 0 };
}

// ─── Optimistic Locking Helper ─────────────────────────────────────────────

/**
 * Atualiza um documento com optimistic locking via version field.
 * Retorna o documento atualizado ou null se a versão não bateu (concorrência).
 * Usa findOneAndUpdate atômico — sem read-modify-write.
 */
async function updateWithVersion<T extends { id: string; version: number }>(
  col: Collection<T>,
  id: string,
  currentVersion: number,
  update: UpdateFilter<T>,
  options?: { upsert?: boolean }
): Promise<T | null> {
  // Documentos gravados antes do campo `version` existir não têm o campo no Mongo —
  // normalizarFases()/normalizarFase() só o sintetizam como 0 na LEITURA, nunca persistem
  // isso. Um filtro `{version: 0}` nunca bate num campo ausente, então travava em 409
  // "concorrência" pra sempre. Quando currentVersion=0, aceita tanto version:0 quanto
  // ausente; o $inc abaixo grava o campo de verdade a partir daí.
  const versionFilter: Filter<T> =
    currentVersion === 0
      ? ({ $or: [{ version: 0 }, { version: { $exists: false } }] } as Filter<T>)
      : ({ version: currentVersion } as Filter<T>);
  const result = await col.findOneAndUpdate(
    { id, ...versionFilter } as Filter<T>,
    { ...update, $inc: { version: 1 } } as any,
    { returnDocument: 'after', upsert: options?.upsert }
  );
  return (result as T) ?? null;
}

// ─── Vagas CRUD ────────────────────────────────────────────────────────────

export async function getVagas(): Promise<Vaga[]> {
  // Cache: 30s fresco, 60s stale (stale-while-revalidate)
  const cached = await cacheGet<Vaga[]>('all', { prefix: 'vagas', ttl: 30, stale: 60 });
  if (cached) return cached.value;

  const col = await vagasCollection();
  const vagas = await col.find({}).toArray();
  const result = vagas.map(normalizarFases).sort((a, b) => {
    if (a.prioritaria && !b.prioritaria) return -1;
    if (!a.prioritaria && b.prioritaria) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  await cacheSet('all', result, { prefix: 'vagas', ttl: 30, stale: 60 });
  return result;
}

export async function getVaga(id: string): Promise<Vaga | undefined> {
  const cached = await cacheGet<Vaga>(id, { prefix: 'vaga', ttl: 30, stale: 60 });
  if (cached) return cached.value;

  const col = await vagasCollection();
  const v = await col.findOne({ id });
  const result = v ? normalizarFases(v) : undefined;
  if (result) {
    await cacheSet(id, result, { prefix: 'vaga', ttl: 30, stale: 60 });
  }
  return result;
}

export async function saveVaga(vaga: Vaga): Promise<void> {
  const col = await vagasCollection();
  await col.replaceOne({ id: vaga.id }, vaga, { upsert: true });
  // Invalida cache
  await cacheDel(vaga.id, 'vaga');
  await cacheDelPrefix('vagas');
}

/** Atualiza vaga com optimistic locking. Retorna a vaga atualizada ou null se concorrência. */
export async function updateVaga(
  id: string,
  currentVersion: number,
  fields: Partial<Omit<Vaga, 'id' | 'version' | 'createdAt'>>
): Promise<Vaga | null> {
  const col = await vagasCollection();
  const update: UpdateFilter<Vaga> = { $set: fields as any };
  const atualizada = await updateWithVersion(col, id, currentVersion, update);
  if (atualizada) {
    // Sem isso, o findOneAndUpdate acima grava certo no Mongo mas o próximo GET
    // (inclusive o carregar() que a UI chama logo após "Salvar") continua servindo
    // a versão em cache por até 30-60s (stale-while-revalidate) — parece que não salvou.
    await cacheDel(id, 'vaga');
    await cacheDelPrefix('vagas');
  }
  return atualizada;
}

/** Remove a vaga e todas as candidaturas dela — não há como recuperar depois. */
export async function deleteVaga(id: string): Promise<void> {
  const vagas = await vagasCollection();
  const candidaturas = await candidaturasCollection();
  await candidaturas.deleteMany({ vagaId: id });
  await vagas.deleteOne({ id });
  // Invalida cache
  await cacheDel(id, 'vaga');
  await cacheDelPrefix('vagas');
}

// ─── Candidaturas CRUD ─────────────────────────────────────────────────────

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
 * Busca a candidatura existente de um e-mail numa vaga (case-insensitive via index).
 */
export async function findCandidaturaPorEmail(
  vagaId: string,
  email: string
): Promise<Candidatura | undefined> {
  const col = await candidaturasCollection();
  const c = await col.findOne({ vagaId, email: email.trim().toLowerCase() });
  return c ? normalizarFase(c) : undefined;
}

export async function saveCandidatura(candidatura: Candidatura): Promise<void> {
  const col = await candidaturasCollection();
  await col.replaceOne({ id: candidatura.id }, candidatura, { upsert: true });
  // Invalida cache de vagas (mudou candidatura → stats mudam)
  await cacheDelPrefix('vagas');
}

/**
 * Cria candidatura com insertOne atômico. Se já existe (duplicate key), retorna a existente.
 * Idempotente por (vagaId, email).
 */
export async function criarCandidaturaAtomica(candidatura: Candidatura): Promise<{ created: boolean; doc: Candidatura }> {
  const col = await candidaturasCollection();
  try {
    await col.insertOne(candidatura as any);
    return { created: true, doc: candidatura };
  } catch (err: any) {
    // Duplicate key = candidatura já existe
    if (err?.code === 11000) {
      const existente = await col.findOne({ vagaId: candidatura.vagaId, email: candidatura.email });
      if (existente) return { created: false, doc: normalizarFase(existente) };
    }
    throw err;
  }
}

// ─── Operações Atômicas de Candidatura ─────────────────────────────────────

/**
 * Adiciona ou substitui uma resposta atomicamente usando $push + $pull.
 * Também limpa o parecer cacheado (precisa ser regenerado).
 */
export async function upsertRespostaAtomica(
  candidaturaId: string,
  resposta: Resposta
): Promise<Candidatura | null> {
  const col = await candidaturasCollection();
  // Remove resposta anterior da mesma pergunta, adiciona a nova, limpa parecer
  const result = await col.findOneAndUpdate(
    { id: candidaturaId } as Filter<Candidatura>,
    {
      $pull: { respostas: { perguntaId: resposta.perguntaId } } as any,
      $push: { respostas: resposta as any },
      $set: { parecer: undefined as any },
      $inc: { version: 1 }
    } as UpdateFilter<Candidatura>,
    { returnDocument: 'after' }
  );
  return result ? normalizarFase(result) : null;
}

/**
 * Atualiza uma resposta existente in-place (para o background job de IA).
 * Usa $set com index posicional pra evitar read-modify-write.
 */
export async function atualizarRespostaAtomica(
  candidaturaId: string,
  perguntaId: string,
  campos: Partial<Omit<Resposta, 'perguntaId' | 'videoPath'>>
): Promise<Candidatura | null> {
  const col = await candidaturasCollection();
  const setFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(campos)) {
    setFields[`respostas.$.${k}`] = v;
  }
  setFields.parecer = undefined;
  const result = await col.findOneAndUpdate(
    { id: candidaturaId, 'respostas.perguntaId': perguntaId } as Filter<Candidatura>,
    { $set: setFields as any, $inc: { version: 1 } } as UpdateFilter<Candidatura>,
    { returnDocument: 'after' }
  );
  return result ? normalizarFase(result) : null;
}

/**
 * Altera a fase de uma candidatura com optimistic locking.
 * Retorna 409 se houve concorrência.
 */
export async function alterarFaseAtomica(
  candidaturaId: string,
  currentVersion: number,
  novaFase: string
): Promise<Candidatura | null> {
  const col = await candidaturasCollection();
  return updateWithVersion(col, candidaturaId, currentVersion, {
    $set: { fase: novaFase } as any
  });
}

/**
 * Finaliza uma candidatura com optimistic locking.
 * Retorna null se concorrência ou candidatura não encontrada.
 */
export async function finalizarCandidaturaAtomica(
  candidaturaId: string,
  currentVersion: number,
  scoreMedio: number | null
): Promise<Candidatura | null> {
  const col = await candidaturasCollection();
  return updateWithVersion(col, candidaturaId, currentVersion, {
    $set: { status: 'concluida', scoreMedio } as any
  });
}

/**
 * Adiciona nota interna atomicamente via $push — sem read-modify-write.
 */
export async function adicionarNotaAtomica(
  candidaturaId: string,
  nota: NotaInterna
): Promise<Candidatura | null> {
  const col = await candidaturasCollection();
  const result = await col.findOneAndUpdate(
    { id: candidaturaId } as Filter<Candidatura>,
    { $push: { notasInternas: nota as any }, $inc: { version: 1 } } as UpdateFilter<Candidatura>,
    { returnDocument: 'after' }
  );
  return result ? normalizarFase(result) : null;
}

/**
 * Atualiza CSAT atomicamente via $set — sem read-modify-write.
 */
export async function salvarCsatAtomica(
  candidaturaId: string,
  csat: Candidatura['csat']
): Promise<Candidatura | null> {
  const col = await candidaturasCollection();
  const result = await col.findOneAndUpdate(
    { id: candidaturaId } as Filter<Candidatura>,
    { $set: { csat: csat as any }, $inc: { version: 1 } } as UpdateFilter<Candidatura>,
    { returnDocument: 'after' }
  );
  return result ? normalizarFase(result) : null;
}

/**
 * Atualiza curriculoPath atomicamente via $set — sem read-modify-write.
 */
export async function salvarCurriculoAtomica(
  candidaturaId: string,
  curriculoPath: string
): Promise<Candidatura | null> {
  const col = await candidaturasCollection();
  const result = await col.findOneAndUpdate(
    { id: candidaturaId } as Filter<Candidatura>,
    { $set: { curriculoPath } as any, $inc: { version: 1 } } as UpdateFilter<Candidatura>,
    { returnDocument: 'after' }
  );
  return result ? normalizarFase(result) : null;
}

/**
 * Atualiza campos gerais da candidatura (PATCH) com optimistic locking.
 */
export async function patchCandidaturaAtomica(
  candidaturaId: string,
  currentVersion: number,
  campos: Record<string, unknown>
): Promise<Candidatura | null> {
  const col = await candidaturasCollection();
  const setFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(campos)) {
    setFields[k] = v;
  }
  return updateWithVersion(col, candidaturaId, currentVersion, {
    $set: setFields as any
  });
}

/**
 * Salva o parecer atomicamente — evita que background job sobrescreva.
 */
export async function salvarParecerAtomico(
  candidaturaId: string,
  currentVersion: number,
  parecer: Parecer
): Promise<Candidatura | null> {
  const col = await candidaturasCollection();
  return updateWithVersion(col, candidaturaId, currentVersion, {
    $set: { parecer: parecer as any } as any
  });
}

export async function deleteCandidatura(id: string): Promise<void> {
  const col = await candidaturasCollection();
  await col.deleteOne({ id });
}
