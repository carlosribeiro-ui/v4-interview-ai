import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI || '';

let clientPromise: Promise<MongoClient> | null = null;

function getClientPromise(): Promise<MongoClient> {
  if (!uri) throw new Error('MONGODB_URI nao configurada no .env.local');

  // Reaproveita a conexão entre invocações (hot reload em dev, warm start em serverless).
  const globalForMongo = global as unknown as { _mongoClientPromise?: Promise<MongoClient> };

  if (!globalForMongo._mongoClientPromise) {
    // family:4 evita falha de handshake TLS observada em runtimes serverless
    // (AWS Lambda/Vercel) que resolvem o SRV do Atlas via IPv6.
    globalForMongo._mongoClientPromise = new MongoClient(uri, {
      family: 4,
      serverSelectionTimeoutMS: 10000,
      // Pool tuning para Vercel serverless: funções são single-threaded,
      // 10 conexões por instância é suficiente. Atlas M0 suporta ~500 total.
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30_000
    }).connect();
  }
  clientPromise = globalForMongo._mongoClientPromise;
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  // MONGODB_DB_NAME permite apontar o dev local para um banco separado
  // (mesmo cluster Atlas, banco diferente) sem tocar nos dados reais do time
  // em produção. Se não setado, usa o banco de produção (comportamento antigo).
  const db = client.db(process.env.MONGODB_DB_NAME || 'v4-interview-ai');

  // Lazy init: cria indexes na primeira conexão (idempotente)
  if (!global._indexesEnsured) {
    global._indexesEnsured = true;
    import('./store').then(({ ensureIndexes }) => ensureIndexes()).catch(() => {});
  }

  return db;
}

// Augment global for indexes flag
declare global {
  var _indexesEnsured: boolean | undefined;
}
