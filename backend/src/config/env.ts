import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  aws: {
    region: process.env.AWS_REGION || 'us-west-2',
    endpoint: process.env.LOCALSTACK_ENDPOINT || undefined,
    credentials: process.env.LOCALSTACK_ENDPOINT
      ? { accessKeyId: 'test', secretAccessKey: 'test' }
      : undefined,
  },
  s3Bucket: process.env.S3_BUCKET || 'checklist-images',
  sqsQueueUrl: process.env.SQS_QUEUE_URL || 'http://localhost:4566/000000000000/pdf-generation-queue',
  wsMode: (process.env.WS_MODE || 'local') as 'local' | 'apigw',
  apiGatewayEndpoint: process.env.APIGW_WS_ENDPOINT || undefined,
  tables: {
    users: process.env.DYNAMODB_TABLE_USERS || 'SanitizationUsers',
    lines: process.env.DYNAMODB_TABLE_LINES || 'SanitizationLines',
    templates: process.env.DYNAMODB_TABLE_TEMPLATES || 'SanitizationTemplates',
    checklists: process.env.DYNAMODB_TABLE_CHECKLISTS || 'SanitizationChecklists',
    connections: process.env.DYNAMODB_TABLE_CONNECTIONS || 'SanitizationConnections',
    auditLog: process.env.DYNAMODB_TABLE_AUDIT_LOG || 'SanitizationAuditLog',
    factories: process.env.DYNAMODB_TABLE_FACTORIES || 'SanitizationFactories',
    rateLimits: process.env.DYNAMODB_TABLE_RATE_LIMITS || 'SanitizationRateLimits',
  },
};
