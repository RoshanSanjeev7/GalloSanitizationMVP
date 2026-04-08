import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { config } from '../config/env.js';

const sqs = new SQSClient({
  region: config.aws.region,
  endpoint: config.aws.endpoint,
  credentials: config.aws.credentials,
});

export async function sendPdfGenerationMessage(checklistId: string): Promise<void> {
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: config.sqsQueueUrl,
      MessageBody: JSON.stringify({ checklistId }),
    }),
  );
}
