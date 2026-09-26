import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { env } from '../config/env';

let client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (client) return client;
  client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
    forcePathStyle: true, // required for MinIO
  });
  return client;
}

/** Creates the bucket if it doesn't exist. Safe to call on every startup. */
export async function ensureBucket(): Promise<void> {
  const s3 = getS3Client();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
      console.log(`[s3] created bucket: ${env.S3_BUCKET}`);
    } catch (err) {
      console.error('[s3] failed to create bucket', err);
      throw err;
    }
  }
}

/** Uploads an object. Returns the key. */
export async function uploadObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

/** Downloads an object fully into a Buffer. */
export async function downloadObject(key: string): Promise<Buffer> {
  const s3 = getS3Client();
  const result = await s3.send(
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key })
  );
  if (!result.Body) throw new Error(`S3 object body missing for key: ${key}`);
  const stream = result.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Deletes an object. No-op if the key does not exist. */
export async function deleteObject(key: string): Promise<void> {
  const s3 = getS3Client();
  try {
    await s3.send(
      new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key })
    );
  } catch (err) {
    console.warn(`[s3] delete failed for ${key}:`, err);
  }
}
