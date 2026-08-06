import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

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

/** Remove um objeto específico do R2. Erros são engolidos (log no console) — cleanup é best-effort. */
export async function deletarDoR2(key: string): Promise<void> {
  if (!BUCKET) return;
  try {
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    console.error(`[R2] falha ao deletar ${key}:`, err);
  }
}

/**
 * Remove todos os objetos com um prefixo (ex: candidaturaId/ ou tts/vagaId/).
 * Usado no DELETE de candidatura/vaga pra não deixar arquivos órfãos.
 * Erros individuais são engolidos — cleanup é best-effort.
 */
export async function deletarPrefixoR2(prefix: string): Promise<void> {
  if (!BUCKET) return;
  try {
    let continuationToken: string | undefined;
    do {
      const list = await client.send(
        new ListObjectsV2Command({
          Bucket: BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken
        })
      );

      if (list.Contents && list.Contents.length > 0) {
        await Promise.all(
          list.Contents.filter((obj) => obj.Key).map((obj) =>
            client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: obj.Key! }))
          )
        );
      }

      continuationToken = list.NextContinuationToken;
    } while (continuationToken);
  } catch (err) {
    console.error(`[R2] falha ao deletar prefixo ${prefix}:`, err);
  }
}
