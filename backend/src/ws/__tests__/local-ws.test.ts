import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('../../data/dynamo.js', () => ({
  docClient: { send: vi.fn().mockResolvedValue({ Items: [] }) },
  getUser: vi.fn().mockResolvedValue({ id: 'u-1', name: 'Gabriel', role: 'operator' }),
}));

vi.mock('../../config/env.js', () => ({
  config: {
    jwtSecret: 'test-secret',
    wsMode: 'local',
    tables: { connections: 'SanitizationConnections' },
    aws: {},
  },
}));

vi.mock('../../data/connections.js', () => ({
  putConnection: vi.fn().mockResolvedValue(undefined),
  deleteConnection: vi.fn().mockResolvedValue(undefined),
  updateConnectionSubscription: vi.fn().mockResolvedValue(undefined),
  updateConnectionMachine: vi.fn().mockResolvedValue(undefined),
  touchConnection: vi.fn().mockResolvedValue(undefined),
  getConnectionsByChecklist: vi.fn().mockResolvedValue([]),
  getConnectionsByChannel: vi.fn().mockResolvedValue([]),
  getAllConnections: vi.fn().mockResolvedValue([]),
}));

import { LocalWsBroadcaster } from '../local-ws.js';
import { putConnection, deleteConnection } from '../../data/connections.js';

describe('LocalWsBroadcaster', () => {
  let broadcaster: LocalWsBroadcaster;

  beforeEach(() => {
    vi.clearAllMocks();
    broadcaster = new LocalWsBroadcaster();
  });

  it('can be instantiated', () => {
    expect(broadcaster).toBeDefined();
  });

  it('throws if init called without server', () => {
    expect(() => broadcaster.init()).toThrow('requires an HTTP server');
  });

  it('getChecklistPresence returns empty array with no connections', async () => {
    const result = await broadcaster.getChecklistPresence('cl-123');
    expect(result).toEqual([]);
  });

  it('broadcastToChecklist does not throw with no connections', async () => {
    await expect(
      broadcaster.broadcastToChecklist('cl-123', { type: 'test' }),
    ).resolves.toBeUndefined();
  });

  it('broadcastPresence does not throw with no connections', async () => {
    await expect(broadcaster.broadcastPresence('cl-123')).resolves.toBeUndefined();
  });

  it('broadcastPresenceSummary does not throw with no connections', async () => {
    await expect(broadcaster.broadcastPresenceSummary()).resolves.toBeUndefined();
  });
});
