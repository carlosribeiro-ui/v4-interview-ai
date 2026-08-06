/**
 * Script de limpeza: remove audioUrl obsoleto de todas as perguntas.
 * Rodar uma vez pra limpar o cache antigo, depois pode apagar.
 *
 * Uso: npx tsx scripts/limpar-cache-tts.ts
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = 'v4-interview-ai';

async function main() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI não configurada');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const vagas = db.collection('vagas');

  const todasVagas = await vagas.find({}).toArray();
  let totalLimpas = 0;

  for (const vaga of todasVagas) {
    let mudou = false;
    for (const p of vaga.perguntas || []) {
      if (p.audioUrl) {
        console.log(`Limpando cache TTS: vaga="${vaga.cargo}" pergunta="${p.texto.slice(0, 50)}..."`);
        p.audioUrl = undefined;
        mudou = true;
        totalLimpas++;
      }
    }
    if (mudou) {
      await vagas.updateOne({ _id: vaga._id }, { $set: { perguntas: vaga.perguntas } });
    }
  }

  console.log(`\n${totalLimpas} cache(s) TTS limpo(s). Agora toda "Ouvir pergunta" vai gerar áudio novo do zero.`);
  await client.close();
}

main().catch(console.error);
