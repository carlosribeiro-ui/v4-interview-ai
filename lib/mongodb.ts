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
      serverSelectionTimeoutMS: 10000
    }).connect();
  }
  clientPromise = globalForMongo._mongoClientPromise;
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db('v4-interview-ai');
}
