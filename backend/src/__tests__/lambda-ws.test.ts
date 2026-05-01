/**
 * Unit tests for the API Gateway WebSocket Lambda handler.
 *
 * The handler dispatches on `requestContext.routeKey` ($connect /
 * $disconnect / $default). Each test invokes `handler(event)` directly
 * with a synthesized API Gateway WebSocket event shape, mocks the
 * downstream calls (DDB CRUD, AWS SDK PostToConnection, JWT/getUser),
 * and asserts both the HTTP-style return value and the side effects.
 *
 * Mock pattern matches the existing local-ws integration test.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// ── Module mocks (must come before importing lambda-ws) ──────────────

vi.mock('../config/env.js', () => ({
  config: {
    jwtSecret: 'lambda-ws-test-secret',
    aws: { region: 'us-west-2' },
    tables: { connections: 'TestConnections', users: 'TestUsers' },
  },
}));

const mockGetUser = vi.fn();
vi.mock('../data/dynamo.js', () => ({
  docClient: {},
  getUser: (...args: unknown[]) => mockGetUser(...args),
}));

const mockPutConnection = vi.fn().mockResolvedValue(undefined);
const mockDeleteConnection = vi.fn().mockResolvedValue(undefined);
const mockGetConnection = vi.fn().mockResolvedValue(null);
const mockUpdateSub = vi.fn().mockResolvedValue(undefined);
const mockUpdateMachine = vi.fn().mockResolvedValue(undefined);
const mockTouch = vi.fn().mockResolvedValue(undefined);
const mockGetByChecklist = vi.fn().mockResolvedValue([]);

vi.mock('../data/connections.js', () => ({
  putConnection: (...args: unknown[]) => mockPutConnection(...args),
  deleteConnection: (...args: unknown[]) => mockDeleteConnection(...args),
  getConnection: (...args: unknown[]) => mockGetConnection(...args),
  updateConnectionSubscription: (...args: unknown[]) => mockUpdateSub(...args),
  updateConnectionMachine: (...args: unknown[]) => mockUpdateMachine(...args),
  touchConnection: (...args: unknown[]) => mockTouch(...args),
  getConnectionsByChecklist: (...args: unknown[]) => mockGetByChecklist(...args),
}));

// Capture every PostToConnectionCommand the handler issues. The
// real client is never instantiated — only `client.send(cmd)` is
// invoked, which we replace at module-mock time.
const mockSend = vi.fn().mockResolvedValue({});
vi.mock('@aws-sdk/client-apigatewaymanagementapi', () => {
  class FakeClient {
    send = mockSend;
  }
  // Capture the data payload so tests can assert on the message body.
  class PostToConnectionCommand {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  }
  class GoneException extends Error {
    name = 'GoneException';
  }
  return {
    ApiGatewayManagementApiClient: FakeClient,
    PostToConnectionCommand,
    GoneException,
  };
});

import { handler } from '../lambda-ws.js';

// ── Helpers ──────────────────────────────────────────────────────────

const JWT_SECRET = 'lambda-ws-test-secret';

function signToken(userId = 'u-1', role = 'operator', expiresIn = 3600): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn });
}

interface BuildEventOpts {
  routeKey: '$connect' | '$disconnect' | '$default';
  connectionId?: string;
  token?: string;
  body?: string;
}

function buildEvent(opts: BuildEventOpts): {
  requestContext: {
    connectionId: string;
    routeKey: '$connect' | '$disconnect' | '$default';
    domainName: string;
    stage: string;
  };
  queryStringParameters: Record<string, string> | null;
  body: string | undefined;
} {
  return {
    requestContext: {
      connectionId: opts.connectionId ?? 'conn-test-1',
      routeKey: opts.routeKey,
      domainName: 'test.execute-api.us-west-2.amazonaws.com',
      stage: 'prod',
    },
    queryStringParameters: opts.token ? { token: opts.token } : null,
    body: opts.body,
  };
}

/** Helper: pull the parsed message body out of the Nth PostToConnection call. */
function getPostedFrame(callIndex: number): Record<string, unknown> | null {
  const call = mockSend.mock.calls[callIndex];
  if (!call) return null;
  const cmd = call[0] as { input: { Data: Buffer } };
  return JSON.parse(cmd.input.Data.toString()) as Record<string, unknown>;
}

// ── Test suite ───────────────────────────────────────────────────────

describe('lambda-ws handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: getUser returns a valid operator. Tests that need
    // failure paths override this in-place.
    mockGetUser.mockResolvedValue({ id: 'u-1', name: 'Operator One', role: 'operator' });
    mockGetByChecklist.mockResolvedValue([]);
    mockGetConnection.mockResolvedValue(null);
    mockSend.mockResolvedValue({});
  });

  // ── $connect ───────────────────────────────────────────────────────

  describe('$connect', () => {
    it('accepts a valid JWT and writes the connection to DDB', async () => {
      const result = await handler(buildEvent({
        routeKey: '$connect',
        token: signToken('u-1'),
      }));

      expect(result.statusCode).toBe(200);
      expect(mockPutConnection).toHaveBeenCalledTimes(1);
      const conn = mockPutConnection.mock.calls[0][0];
      expect(conn.connectionId).toBe('conn-test-1');
      expect(conn.userId).toBe('u-1');
      expect(conn.userRole).toBe('operator');
    });

    it('rejects with 401 when no token is provided', async () => {
      const result = await handler(buildEvent({ routeKey: '$connect' }));

      expect(result.statusCode).toBe(401);
      expect(mockPutConnection).not.toHaveBeenCalled();
    });

    it('rejects with 401 when JWT is malformed', async () => {
      const result = await handler(buildEvent({
        routeKey: '$connect',
        token: 'not-a-real-jwt',
      }));

      expect(result.statusCode).toBe(401);
      expect(mockPutConnection).not.toHaveBeenCalled();
    });

    it('rejects with 401 when JWT is signed with the wrong secret', async () => {
      const badToken = jwt.sign({ userId: 'u-1', role: 'operator' }, 'wrong-secret', { expiresIn: 3600 });
      const result = await handler(buildEvent({
        routeKey: '$connect',
        token: badToken,
      }));

      expect(result.statusCode).toBe(401);
      expect(mockPutConnection).not.toHaveBeenCalled();
    });

    it('rejects with 401 when the JWT is valid but the user no longer exists', async () => {
      mockGetUser.mockResolvedValueOnce(undefined);

      const result = await handler(buildEvent({
        routeKey: '$connect',
        token: signToken('ghost-user'),
      }));

      expect(result.statusCode).toBe(401);
      expect(mockPutConnection).not.toHaveBeenCalled();
    });

    it('rejects with 401 when JWT is expired', async () => {
      const expired = jwt.sign({ userId: 'u-1', role: 'operator' }, JWT_SECRET, { expiresIn: -10 });
      const result = await handler(buildEvent({
        routeKey: '$connect',
        token: expired,
      }));

      expect(result.statusCode).toBe(401);
      expect(mockPutConnection).not.toHaveBeenCalled();
    });
  });

  // ── $disconnect ────────────────────────────────────────────────────

  describe('$disconnect', () => {
    it('deletes the connection record', async () => {
      const result = await handler(buildEvent({
        routeKey: '$disconnect',
        connectionId: 'conn-bye',
      }));

      expect(result.statusCode).toBe(200);
      expect(mockDeleteConnection).toHaveBeenCalledWith('conn-bye');
    });

    it('returns 200 even if the delete throws (best-effort cleanup)', async () => {
      mockDeleteConnection.mockRejectedValueOnce(new Error('DDB transient'));

      const result = await handler(buildEvent({
        routeKey: '$disconnect',
        connectionId: 'conn-broken',
      }));

      expect(result.statusCode).toBe(200);
    });

    it('broadcasts presence-leave to remaining peers when the leaver was on a checklist', async () => {
      // The disconnecting connection was on cl-1; after delete, one
      // peer remains on the same checklist.
      mockGetConnection.mockResolvedValueOnce({
        connectionId: 'conn-leaver',
        userId: 'u-leave',
        userName: 'Leaver',
        userRole: 'operator',
        checklistId: 'cl-1',
        activeMachine: 0,
        channel: 'checklist:cl-1',
        connectedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        ttl: 0,
      });
      mockGetByChecklist.mockResolvedValueOnce([
        {
          connectionId: 'conn-stay',
          userId: 'u-stay',
          userName: 'Stayer',
          userRole: 'operator',
          checklistId: 'cl-1',
          activeMachine: 1,
          channel: 'checklist:cl-1',
          connectedAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          ttl: 0,
        },
      ]);

      const result = await handler(buildEvent({
        routeKey: '$disconnect',
        connectionId: 'conn-leaver',
      }));

      expect(result.statusCode).toBe(200);
      expect(mockDeleteConnection).toHaveBeenCalledWith('conn-leaver');
      // PostToConnection fired against the remaining peer
      expect(mockSend).toHaveBeenCalledTimes(1);
      const frame = getPostedFrame(0);
      expect(frame?.type).toBe('presence');
      expect(frame?.checklistId).toBe('cl-1');
      const users = (frame?.users as Array<{ id: string }>) ?? [];
      expect(users.map((u) => u.id)).toEqual(['u-stay']);
    });

    it('skips the presence-leave broadcast when the connection was on the dashboard (no checklistId)', async () => {
      mockGetConnection.mockResolvedValueOnce({
        connectionId: 'conn-dash',
        userId: 'u-1',
        userName: 'Dasher',
        userRole: 'admin',
        checklistId: null,
        activeMachine: null,
        channel: 'dashboard',
        connectedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        ttl: 0,
      });

      const result = await handler(buildEvent({
        routeKey: '$disconnect',
        connectionId: 'conn-dash',
      }));

      expect(result.statusCode).toBe(200);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  // ── $default (message dispatch) ────────────────────────────────────

  describe('$default', () => {
    it('returns an INVALID_JSON error frame for non-JSON bodies', async () => {
      await handler(buildEvent({
        routeKey: '$default',
        body: 'not-json-at-all',
      }));

      expect(mockSend).toHaveBeenCalledTimes(1);
      const frame = getPostedFrame(0);
      expect(frame?.type).toBe('error');
      expect(frame?.code).toBe('INVALID_JSON');
    });

    it('returns an UNKNOWN_TYPE error frame for unknown discriminators', async () => {
      await handler(buildEvent({
        routeKey: '$default',
        body: JSON.stringify({ type: 'never_heard_of_this' }),
      }));

      expect(mockSend).toHaveBeenCalledTimes(1);
      const frame = getPostedFrame(0);
      expect(frame?.type).toBe('error');
      expect(frame?.code).toBe('UNKNOWN_TYPE');
    });

    it('returns an INVALID_PAYLOAD error frame when required fields are missing', async () => {
      await handler(buildEvent({
        routeKey: '$default',
        body: JSON.stringify({ type: 'subscribe' }), // missing checklistId
      }));

      expect(mockSend).toHaveBeenCalledTimes(1);
      const frame = getPostedFrame(0);
      expect(frame?.code).toBe('INVALID_PAYLOAD');
    });

    it('subscribe → updates the connection record and broadcasts presence', async () => {
      mockGetByChecklist.mockResolvedValueOnce([
        {
          connectionId: 'conn-test-1',
          userId: 'u-1',
          userName: 'Operator One',
          userRole: 'operator',
          checklistId: 'cl-1',
          activeMachine: null,
          channel: 'checklist:cl-1',
          connectedAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          ttl: 0,
        },
      ]);

      await handler(buildEvent({
        routeKey: '$default',
        connectionId: 'conn-test-1',
        body: JSON.stringify({ type: 'subscribe', checklistId: 'cl-1' }),
      }));

      expect(mockUpdateSub).toHaveBeenCalledWith('conn-test-1', 'cl-1', null);
      expect(mockSend).toHaveBeenCalledTimes(1);
      const frame = getPostedFrame(0);
      expect(frame?.type).toBe('presence');
      expect(frame?.checklistId).toBe('cl-1');
    });

    it('machine_change → updates active machine and broadcasts presence with new index', async () => {
      mockGetByChecklist.mockResolvedValueOnce([
        {
          connectionId: 'conn-test-1',
          userId: 'u-1',
          userName: 'Operator One',
          userRole: 'operator',
          checklistId: 'cl-1',
          activeMachine: 7,
          channel: 'checklist:cl-1',
          connectedAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          ttl: 0,
        },
      ]);

      await handler(buildEvent({
        routeKey: '$default',
        body: JSON.stringify({ type: 'machine_change', checklistId: 'cl-1', machineIdx: 7 }),
      }));

      expect(mockUpdateMachine).toHaveBeenCalledWith('conn-test-1', 7);
      const frame = getPostedFrame(0);
      const users = (frame?.users as Array<{ id: string; machine: number }>) ?? [];
      expect(users[0]?.machine).toBe(7);
    });

    it('heartbeat → only touches the connection, no broadcast', async () => {
      await handler(buildEvent({
        routeKey: '$default',
        body: JSON.stringify({ type: 'heartbeat' }),
      }));

      expect(mockTouch).toHaveBeenCalledTimes(1);
      expect(mockSend).not.toHaveBeenCalled();
      expect(mockUpdateSub).not.toHaveBeenCalled();
      expect(mockUpdateMachine).not.toHaveBeenCalled();
    });

    it('unsubscribe → clears subscription, no broadcast (presence-leave deferred to disconnect)', async () => {
      await handler(buildEvent({
        routeKey: '$default',
        body: JSON.stringify({ type: 'unsubscribe', checklistId: 'cl-1' }),
      }));

      expect(mockUpdateSub).toHaveBeenCalledWith('conn-test-1', null, null);
    });
  });

  // ── Top-level errors ───────────────────────────────────────────────

  describe('error handling', () => {
    it('returns 500 if dispatch throws unexpectedly', async () => {
      mockGetUser.mockRejectedValueOnce(new Error('catastrophic'));

      const result = await handler(buildEvent({
        routeKey: '$connect',
        token: signToken('u-1'),
      }));

      expect(result.statusCode).toBe(500);
    });
  });
});
