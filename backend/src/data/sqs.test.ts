import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSend } = vi.hoisted(() => {
  const mockSend = vi.fn().mockResolvedValue({});
  return { mockSend };
});

vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: class { send = mockSend; },
  SendMessageCommand: vi.fn().mockImplementation((params: any) => params),
}));

import { sendPdfGenerationMessage } from './sqs.js';
import { SendMessageCommand } from '@aws-sdk/client-sqs';

describe('SQS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends a message with the correct checklistId', async () => {
    await sendPdfGenerationMessage('cl-123');

    expect(mockSend).toHaveBeenCalledOnce();

    const command = vi.mocked(SendMessageCommand).mock.calls[0][0];
    const body = JSON.parse(command.MessageBody);
    expect(body.checklistId).toBe('cl-123');
  });
});
