import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../data/dynamo.js', () => ({
  docClient: { send: vi.fn().mockResolvedValue({ Items: [] }) },
}));

vi.mock('../../config/env.js', () => ({
  config: {
    tables: { connections: 'SanitizationConnections' },
    aws: {},
  },
}));

import { docClient } from '../../data/dynamo.js';
import {
  putConnection,
  deleteConnection,
  updateConnectionSubscription,
  getConnectionsByChecklist,
  getConnectionsByChannel,
  touchConnection,
} from '../../data/connections.js';

const mockSend = vi.mocked(docClient.send);

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ Items: [] } as any);
});

describe('connections data layer', () => {
  it('putConnection sends PutCommand with ttl', async () => {
    await putConnection({
      connectionId: 'conn-1',
      userId: 'u-1',
      userName: 'Gabriel',
      userRole: 'operator',
      checklistId: null,
      activeMachine: null,
      channel: 'dashboard',
      connectedAt: '2026-04-10T00:00:00Z',
      lastActivity: '2026-04-10T00:00:00Z',
      ttl: 0,
    });
    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0] as any;
    expect(cmd.input.TableName).toBe('SanitizationConnections');
    expect(cmd.input.Item.connectionId).toBe('conn-1');
    expect(cmd.input.Item.ttl).toBeGreaterThan(0);
  });

  it('deleteConnection sends DeleteCommand', async () => {
    await deleteConnection('conn-1');
    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0] as any;
    expect(cmd.input.Key).toEqual({ connectionId: 'conn-1' });
  });

  it('updateConnectionSubscription sets checklistId and channel', async () => {
    await updateConnectionSubscription('conn-1', 'cl-123', 0);
    const cmd = mockSend.mock.calls[0][0] as any;
    expect(cmd.input.ExpressionAttributeValues[':cid']).toBe('cl-123');
    expect(cmd.input.ExpressionAttributeValues[':ch']).toBe('checklist:cl-123');
    expect(cmd.input.ExpressionAttributeValues[':am']).toBe(0);
  });

  it('updateConnectionSubscription with null sets dashboard channel', async () => {
    await updateConnectionSubscription('conn-1', null, null);
    const cmd = mockSend.mock.calls[0][0] as any;
    expect(cmd.input.ExpressionAttributeValues[':ch']).toBe('dashboard');
  });

  it('getConnectionsByChecklist queries checklistId-index', async () => {
    mockSend.mockResolvedValueOnce({ Items: [{ connectionId: 'c1' }] } as any);
    const result = await getConnectionsByChecklist('cl-123');
    expect(result).toHaveLength(1);
    const cmd = mockSend.mock.calls[0][0] as any;
    expect(cmd.input.IndexName).toBe('checklistId-index');
  });

  it('getConnectionsByChannel queries channel-index', async () => {
    await getConnectionsByChannel('dashboard');
    const cmd = mockSend.mock.calls[0][0] as any;
    expect(cmd.input.IndexName).toBe('channel-index');
  });

  it('touchConnection updates lastActivity and ttl', async () => {
    await touchConnection('conn-1');
    const cmd = mockSend.mock.calls[0][0] as any;
    expect(cmd.input.UpdateExpression).toContain('lastActivity');
  });
});
