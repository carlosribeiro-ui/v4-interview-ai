/**
 * Seed script: registra os Talent Acquisition emails como usuários role='talent'.
 * Roda com: npx tsx scripts/seed-ta.ts
 * Requer MONGODB_URI no .env.local ou env.
 */

import { MongoClient } from 'mongodb';
import { randomUUID, randomBytes, scryptSync } from 'crypto';

const MONGODB_URI = process.env.MONGODB_URI || '';

// Fallback: se SRV não resolve no Node.js, usa hosts diretos
const MONGODB_HOSTS = [
  'ac-mufotu2-shard-00-00.71rxuxg.mongodb.net',
  'ac-mufotu2-shard-00-01.71rxuxg.mongodb.net',
  'ac-mufotu2-shard-00-02.71rxuxg.mongodb.net'
];

const TA_USERS = [
  { nome: 'Julia Perin', email: 'julia.perin@v4company.com' },
  { nome: 'Rayane Leme', email: 'rayane.leme@v4company.com' },
  { nome: 'Jessica Maria Silva', email: 'jessicamaria.silva@v4company.com' },
  { nome: 'Gabriella Zappelini', email: 'gabriella.zappelini@v4company.com' },
  { nome: 'Ana Maykot', email: 'ana.maykot@v4company.com' },
  { nome: 'Jonathan Baumgarten', email: 'jonathan.baumgarten@v4company.com' },
  { nome: 'Carlos Ribeiro', email: 'carlos.ribeiro@v4company.com' },
  { nome: 'Julia Lorca', email: 'julia.lorca@v4company.com' },
  { nome: 'Francesca Druzian', email: 'francesca.druzian@v4company.com' },
  { nome: 'Renata Bragante', email: 'renata.bragante@v4company.com' },
];

function hashSenha(senha: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(senha, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI não configurada. Defina no .env.local ou env.');
    process.exit(1);
  }

  // Converte mongodb+srv:// pra mongodb:// com hosts diretos (Node.js SRV lookup falha em algumas máquinas)
  let uri = MONGODB_URI;
  if (uri.includes('mongodb+srv://')) {
    const rest = uri.replace('mongodb+srv://', '');
    const [auth, restAfterAuth] = rest.split('@');
    const dbPart = restAfterAuth || rest;
    const clusterHost = dbPart.split('/')[0];
    // Extract DB name if present
    const slashIdx = dbPart.indexOf('/');
    const dbName = slashIdx >= 0 ? dbPart.slice(slashIdx + 1).split('?')[0] : 'v4-interview-ai';
    const queryString = slashIdx >= 0 ? dbPart.slice(dbPart.indexOf('?') + 1) : '';
    uri = `mongodb://${auth}@${MONGODB_HOSTS.join(',')}/?replicaSet=atlas-${clusterHost.split('.')[0].replace('ac-', '').replace(/-shard-\d+/, '')}&authSource=admin${queryString ? '&' + queryString : ''}`;
    console.log('[Seed] Usando conexão direta (hosts explícitos)');
  }

  const client = new MongoClient(uri, { family: 4, serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db('v4-interview-ai');
  const col = db.collection('usuarios');

  // Ensure unique index
  await col.createIndex({ email: 1 }, { unique: true, sparse: true });

  let created = 0;
  let skipped = 0;

  for (const ta of TA_USERS) {
    const email = ta.email.trim().toLowerCase();
    const existente = await col.findOne({ email });
    if (existente) {
      console.log(`  SKIP (já existe): ${email}`);
      skipped++;
      continue;
    }

    // Senha padrão: TA2026! (devem trocar no primeiro login)
    const senha = 'TA2026!';
    const usuario = {
      id: randomUUID(),
      nome: ta.nome.trim(),
      email,
      role: 'talent',
      senha: hashSenha(senha),
      tokenVersion: 0
    };

    await col.insertOne(usuario);
    console.log(`  CRIADO: ${ta.nome} <${email}> (senha: ${senha})`);
    created++;
  }

  console.log(`\nResumo: ${created} criados, ${skipped} já existiam`);
  await client.close();
}

main().catch((err) => {
  console.error('Erro ao criar TA users:', err);
  process.exit(1);
});
