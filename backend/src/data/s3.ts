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

export async function deleteImage(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
    })
  );
}
