import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || ''
  }
});

const BUCKET = process.env.R2_BUCKET || '';
const PUBLIC_BASE = process.env.R2_PUBLIC_URL || `${process.env.R2_ENDPOINT}/${BUCKET}`;

/** Envia um arquivo pro bucket R2 e devolve a URL pública (via domínio público do bucket, se configurado). */
export async function uploadParaR2(key: string, buffer: Buffer, contentType: string): Promise<string> {
  if (!BUCKET) throw new Error('R2_BUCKET nao configurado no .env.local');
  await client.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType })
  );
  return `${PUBLIC_BASE}/${key}`;
}
