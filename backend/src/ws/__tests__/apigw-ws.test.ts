/**
 * Unit tests for ApiGatewayBroadcaster — the production-mode broadcaster
 * the Express HTTP routes call when they want to push a message back
 * to subscribed WebSocket clients.
 *
 * The broadcaster doesn't own a persistent connection itself; every
 * message goes through the API Gateway Management API. Tests mock both
 * `data/connections` (DDB CRUD) and the AWS SDK client to isolate the
 * fan-out logic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({
  config: {
    apiGatewayEndpoint: 'https://test.execute-api.us-west-2.amazonaws.com/prod',
    aws: { region: 'us-west-2' },
    tables: { connections: 'TestConnections' },
  },
}));

const mockGetByChecklist = vi.fn();
const mockGetByChannel = vi.fn();
const mockGetAllConnections = vi.fn();
const mockDeleteConnection = vi.fn().mockResolvedValue(undefined);

vi.mock('../../data/connections.js', () => ({
  getConnectionsByChecklist: (...a: unknown[]) => mockGetByChecklist(...a),
  getConnectionsByChannel: (...a: unknown[]) => mockGetByChannel(...a),
  getAllConnections: (...a: unknown[]) => mockGetAllConnections(...a),
  deleteConnection: (...a: unknown[]) => mockDeleteConnection(...a),
}));

const mockSend = vi.fn();
vi.mock('@aws-sdk/client-apigatewaymanagementapi', () => {
  class FakeClient {
    send = mockSend;
  }
  class PostToConnectionCommand {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  }
  // Declared inside the factory because vi.mock hoists above local
  // top-level declarations — referencing an outer class would fire
  // the "Cannot access before initialization" error.
  class GoneException extends Error {
    constructor(message?: string) {
      super(message);
      this.name = 'GoneException';
    }
  }
  return {
    ApiGatewayManagementApiClient: FakeClient,
    PostToConnectionCommand,
    GoneException,
  };
});

// Pull the mocked GoneException for tests to throw against.
async function getMockedGoneException(): Promise<new (msg?: string) => Error> {
  const mod = await import('@aws-sdk/client-apigatewaymanagementapi');
  return mod.GoneException as unknown as new (msg?: string) => Error;
}

import { ApiGatewayBroadcaster } from '../apigw-ws.js';

function fakeConn(id: string, userId: string, checklistId: string | null = null, machine: number | null = null) {
  return {
    connectionId: id,
    userId,
    userName: `User ${userId}`,
    userRole: 'operator',
    checklistId,
    activeMachine: machine,
    channel: checklistId ? `checklist:${checklistId}` : 'dashboard',
    connectedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    ttl: 0,
  };
}

function postedToConnection(callIdx: number): { connectionId: string; data: Record<string, unknown> } {
  const cmd = mockSend.mock.calls[callIdx]?.[0] as { input: { ConnectionId: string; Data: Buffer } };
  return {
    connectionId: cmd.input.ConnectionId,
    data: JSON.parse(cmd.input.Data.toString()) as Record<string, unknown>,
  };
}

describe('ApiGatewayBroadcaster', () => {
  let bc: ApiGatewayBroadcaster;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({});
    bc = new ApiGatewayBroadcaster();
    bc.init();
  });

  describe('init', () => {
    it('throws when APIGW_WS_ENDPOINT is missing', async () => {
      // Bypass the cached config by patching the module's import — easier
      // path: instantiate a fresh broadcaster after temporarily clearing
      // the endpoint via vi.doMock.
      vi.resetModules();
      vi.doMock('../../config/env.js', () => ({
        config: {
          apiGatewayEndpoint: undefined,
          aws: { region: 'us-west-2' },
          tables: { connections: 'TestConnections' },
        },
      }));
      const mod = await import('../apigw-ws.js');
      const fresh = new mod.ApiGatewayBroadcaster();
      expect(() => fresh.init()).toThrow(/APIGW_WS_ENDPOINT/);
      vi.doUnmock('../../config/env.js');
      vi.resetModules();
    });
  });

  describe('broadcastToChecklist', () => {
    it('sends to every connection in the checklist', async () => {
      mockGetByChecklist.mockResolvedValueOnce([
        fakeConn('c1', 'u-a', 'cl-1'),
        fakeConn('c2', 'u-b', 'cl-1'),
        fakeConn('c3', 'u-c', 'cl-1'),
      ]);

      // Re-init to pick up the mocks (we did vi.resetModules in init test)
      bc = new ApiGatewayBroadcaster();
      bc.init();

      await bc.broadcastToChecklist('cl-1', { type: 'item_update', value: 42 });

      expect(mockSend).toHaveBeenCalledTimes(3);
      const recipients = [0, 1, 2].map((i) => postedToConnection(i).connectionId).sort();
      expect(recipients).toEqual(['c1', 'c2', 'c3']);
      const frame = postedToConnection(0).data;
      expect(frame.type).toBe('item_update');
      expect(frame.value).toBe(42);
    });

    it('skips connections matching excludeUserId', async () => {
      mockGetByChecklist.mockResolvedValueOnce([
        fakeConn('c1', 'u-self', 'cl-1'),
        fakeConn('c2', 'u-other', 'cl-1'),
      ]);
      bc = new ApiGatewayBroadcaster();
      bc.init();

      await bc.broadcastToChecklist('cl-1', { type: 'item_update' }, 'u-self');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(postedToConnection(0).connectionId).toBe('c2');
    });

    it('reaps a stale connection on GoneException without failing the broadcast', async () => {
      const Gone = await getMockedGoneException();
      mockGetByChecklist.mockResolvedValueOnce([
        fakeConn('c-gone', 'u-a', 'cl-1'),
        fakeConn('c-live', 'u-b', 'cl-1'),
      ]);
      // First send (c-gone) throws GoneException; second (c-live) succeeds.
      mockSend
        .mockRejectedValueOnce(new Gone('connection gone'))
        .mockResolvedValueOnce({});

      bc = new ApiGatewayBroadcaster();
      bc.init();

      await bc.broadcastToChecklist('cl-1', { type: 'item_update' });

      // Both PostToConnection attempts were made (broadcast didn't bail
      // out on the first failure).
      expect(mockSend).toHaveBeenCalledTimes(2);
      // The stale connection was reaped from DDB.
      expect(mockDeleteConnection).toHaveBeenCalledWith('c-gone');
      expect(mockDeleteConnection).toHaveBeenCalledTimes(1);
    });
  });

  describe('broadcastPresence', () => {
    it('dedups multi-tab users by userId', async () => {
      mockGetByChecklist.mockResolvedValueOnce([
        fakeConn('tab1', 'u-multi', 'cl-1', 0),
        fakeConn('tab2', 'u-multi', 'cl-1', 1),
        fakeConn('cobs', 'u-other', 'cl-1', null),
      ]);
      bc = new ApiGatewayBroadcaster();
      bc.init();

      await bc.broadcastPresence('cl-1');

      // Three PostToConnection calls (one per connection record), but
      // each frame's `users` array should have only 2 entries (deduped).
      expect(mockSend).toHaveBeenCalledTimes(3);
      const frame = postedToConnection(0).data;
      const users = frame.users as Array<{ id: string }>;
      expect(users).toHaveLength(2);
      expect(users.map((u) => u.id).sort()).toEqual(['u-multi', 'u-other']);
    });
  });

  describe('getChecklistPresence', () => {
    it('returns the deduped user list without sending any frames', async () => {
      mockGetByChecklist.mockResolvedValueOnce([
        fakeConn('a', 'u-1', 'cl-1', 3),
        fakeConn('b', 'u-1', 'cl-1', 4), // dup
        fakeConn('c', 'u-2', 'cl-1', 7),
      ]);
      bc = new ApiGatewayBroadcaster();
      bc.init();

      const presence = await bc.getChecklistPresence('cl-1');

      expect(presence).toHaveLength(2);
      expect(presence.map((u) => u.id).sort()).toEqual(['u-1', 'u-2']);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
