import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  // S3 config (optional - falls back to local storage if not set)
  awsRegion: process.env.AWS_REGION || '',
  s3Bucket: process.env.S3_BUCKET || '',
};
