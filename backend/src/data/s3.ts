import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env.js';

const s3 = new S3Client({
  region: config.aws.region,
  endpoint: config.aws.endpoint,
  credentials: config.aws.credentials,
  forcePathStyle: true,
});

export async function uploadImage(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

export async function getImageUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.s3Bucket,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

/**
 * Mint a short-lived presigned PUT URL so the browser can upload bytes
 * directly to S3 (skipping the API entirely). Used by the image upload
 * flow to avoid Lambda's 6 MB request payload cap and to remove a hop
 * of byte-shuffling on the API path.
 *
 * `expiresIn` is intentionally short (60s) — the URL only needs to live
 * long enough to start the upload; once the PUT is in flight S3 honors
 * it to completion regardless of expiry.
 */
export async function getPresignedPutUrl(
  key: string,
  contentType: string,
  expiresInSec = 60,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: expiresInSec });
}

export async function getImageUrls(keys: string[]): Promise<Record<string, string>> {
  const entries = await Promise.all(
    keys.map(async (key) => [key, await getImageUrl(key)] as const),
  );
  return Object.fromEntries(entries);
}

export async function deleteImage(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
    })
  );
}
