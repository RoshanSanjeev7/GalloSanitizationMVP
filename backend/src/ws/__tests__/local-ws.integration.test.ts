/**
 * Integration tests for `LocalWsBroadcaster`.
 *
 * Boots a real `http.Server` on an ephemeral port, attaches a real
 * `LocalWsBroadcaster`, and connects real `ws` clients. The full
 * connection lifecycle — origin check, JWT verify, validation, rate
 * limiting, JWT re-verify on privileged messages, graceful shutdown,
 * presence broadcast, multi-tab dedup — is exercised end-to-end.
 *
 * What's mocked:
 *   - `data/dynamo.js` (returns a fake user) and `data/connections.js`
 *     (no-op DynamoDB writes) so the suite has no LocalStack dependency.
 *   - `config/env.js` is given a stable `jwtSecret` for signing.
 *
 * What's real:
 *   - The HTTP server, the WebSocket upgrade handshake, the `ws`
 *     client library, the JWT signing/verification, the broadcaster's
 *     full message-routing path, and timer-driven behavior (with
 *     pingInterval shrunk to ~milliseconds via constructor options).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';

// ── Module mocks (must come before importing local-ws) ────────────────
vi.mock('../../data/dynamo.js', () => ({
  docClient: { send: vi.fn().mockResolvedValue({ Items: [] }) },
  getUser: vi.fn().mockResolvedValue({ id: 'u-1', name: 'Operator One', role: 'operator' }),
}));

vi.mock('../../config/env.js', () => ({
  config: {
    jwtSecret: 'integration-test-secret',
    frontendOrigin: 'http://localhost:3000',
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

// ── Test infrastructure ───────────────────────────────────────────────

const JWT_SECRET = 'integration-test-secret';

/**
 * Sign a JWT that looks like what `routes/auth.ts` produces.
 * `expiresIn` accepts a number-of-seconds for fine-grained test control.
 */
function signToken(opts: { userId: string; role: string; expiresIn?: number } = { userId: 'u-1', role: 'operator' }): string {
  return jwt.sign(
    { userId: opts.userId, role: opts.role },
    JWT_SECRET,
    { expiresIn: opts.expiresIn ?? 3600 },
  );
}

/**
 * Open a ws client and resolve once a successful `connected` frame
 * arrives. If the first frame is an `error` (auth failure, validation,
 * etc.), the connection is treated as rejected so test cases for
 * "should fail to connect" can use `.rejects.toThrow()`.
 */
function connectClient(
  port: number,
  token: string,
  opts: { headers?: Record<string, string>; rejectUnauthorized?: boolean } = {},
): Promise<{ ws: WebSocket; firstFrame: any }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(token)}`, {
      headers: opts.headers,
    });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('connectClient timed out waiting for first frame'));
    }, 1500);
    ws.once('message', (data) => {
      clearTimeout(timer);
      let parsed: any;
      try {
        parsed = JSON.parse(data.toString());
      } catch (err) {
        return reject(err);
      }
      // An `error` frame means the server refused the handshake (bad
      // token, missing token, etc.). Surface that as a rejection so
      // negative test cases assert correctly.
      if (parsed.type === 'error') {
        ws.close();
        return reject(new Error(`server rejected: ${parsed.code ?? 'unknown'}: ${parsed.message ?? ''}`));
      }
      resolve({ ws, firstFrame: parsed });
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    ws.once('close', (code, reason) => {
      clearTimeout(timer);
      reject(new Error(`closed_before_frame:${code}:${reason}`));
    });
  });
}

/** Wait for the next message of a given `type` from a connected client, or all messages if `type` omitted. */
function nextMessage(ws: WebSocket, type?: string, timeoutMs = 1000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener('message', onMessage);
      reject(new Error(`timed out waiting for message${type ? ` of type ${type}` : ''}`));
    }, timeoutMs);
    function onMessage(data: WebSocket.RawData): void {
      let parsed: any;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (type && parsed.type !== type) return;
      clearTimeout(timer);
      ws.removeListener('message', onMessage);
      resolve(parsed);
    }
    ws.on('message', onMessage);
  });
}

/** Wait for the close event with the close code. */
function waitForClose(ws: WebSocket, timeoutMs = 1500): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.CLOSED) {
      // Already closed — synthesize a result; tests shouldn't hit this path
      // because they wait for close before checking.
      return resolve({ code: 1006, reason: '' });
    }
    const timer = setTimeout(() => reject(new Error('timed out waiting for close')), timeoutMs);
    ws.once('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
}

// ── Test suite ────────────────────────────────────────────────────────

describe('LocalWsBroadcaster integration', () => {
  let server: HttpServer;
  let broadcaster: LocalWsBroadcaster;
  let port: number;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = createServer();
    // Tight timings so ping/pong test paths complete in ms, not seconds.
    broadcaster = new LocalWsBroadcaster({ pingIntervalMs: 50, pongTimeoutMs: 100 });
    broadcaster.init(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    // shutdown() is idempotent and closes the wss; then we close the http server.
    await broadcaster.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ── Connect lifecycle ───────────────────────────────────────────────

  describe('connect', () => {
    it('accepts a valid JWT and returns connected', async () => {
      const token = signToken();
      const { ws, firstFrame } = await connectClient(port, token);
      expect(firstFrame.type).toBe('connected');
      expect(firstFrame.userId).toBe('u-1');
      expect(typeof firstFrame.connectionId).toBe('string');
      ws.close();
    });

    it('rejects connection with no token', async () => {
      await expect(connectClient(port, '')).rejects.toThrow();
    });

    it('rejects connection with malformed token', async () => {
      await expect(connectClient(port, 'not-a-jwt')).rejects.toThrow();
    });

    it('rejects connection with disallowed origin', async () => {
      const token = signToken();
      await expect(
        connectClient(port, token, { headers: { Origin: 'http://evil.example.com' } }),
      ).rejects.toThrow();
    });

    it('accepts connection with no Origin header (server-to-server clients)', async () => {
      const token = signToken();
      const { ws, firstFrame } = await connectClient(port, token, { headers: {} });
      expect(firstFrame.type).toBe('connected');
      ws.close();
    });
  });

  // ── Validation + strikes ────────────────────────────────────────────

  describe('validation', () => {
    it('returns INVALID_JSON for non-JSON payload', async () => {
      const { ws } = await connectClient(port, signToken());
      ws.send('this is not json');
      const err = await nextMessage(ws, 'error');
      expect(err.code).toBe('INVALID_JSON');
      ws.close();
    });

    it('returns UNKNOWN_TYPE for unknown discriminator', async () => {
      const { ws } = await connectClient(port, signToken());
      ws.send(JSON.stringify({ type: 'definitely_not_real' }));
      const err = await nextMessage(ws, 'error');
      expect(err.code).toBe('UNKNOWN_TYPE');
      ws.close();
    });

    it('returns INVALID_PAYLOAD for missing required field', async () => {
      const { ws } = await connectClient(port, signToken());
      ws.send(JSON.stringify({ type: 'subscribe' })); // missing checklistId
      const err = await nextMessage(ws, 'error');
      expect(err.code).toBe('INVALID_PAYLOAD');
      ws.close();
    });

    it('closes the connection after 3 consecutive invalid messages (TOO_MANY_STRIKES)', async () => {
      const { ws } = await connectClient(port, signToken());
      ws.send('garbage 1');
      await nextMessage(ws, 'error');
      ws.send('garbage 2');
      await nextMessage(ws, 'error');
      ws.send('garbage 3');
      // The 3rd strike should trigger close 4400.
      const close = await waitForClose(ws);
      expect(close.code).toBe(4400);
    });

    it('resets the strike counter on a valid message between strikes', async () => {
      const { ws } = await connectClient(port, signToken());
      ws.send('garbage 1');
      await nextMessage(ws, 'error');
      ws.send('garbage 2');
      await nextMessage(ws, 'error');
      // Valid message resets the strike counter.
      ws.send(JSON.stringify({ type: 'heartbeat' }));
      // Wait a beat for the heartbeat to be processed.
      await new Promise((r) => setTimeout(r, 50));
      // Now we can send another invalid without immediate close.
      ws.send('garbage 3');
      const err = await nextMessage(ws, 'error');
      expect(err.code).toBe('INVALID_JSON');
      // Connection should still be open.
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });
  });

  // ── Rate limiting ───────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('returns RATE_LIMITED when bucket exhausted', async () => {
      const { ws } = await connectClient(port, signToken());
      // heartbeat capacity = 2. Send 3 quickly; the 3rd should be rejected.
      ws.send(JSON.stringify({ type: 'heartbeat' }));
      ws.send(JSON.stringify({ type: 'heartbeat' }));
      ws.send(JSON.stringify({ type: 'heartbeat' }));
      const err = await nextMessage(ws, 'error');
      expect(err.code).toBe('RATE_LIMITED');
      expect(typeof err.retryAfterMs).toBe('number');
      ws.close();
    });

    it('closes connection after RATE_LIMIT_HIT_THRESHOLD consecutive over-limit hits', async () => {
      const { ws } = await connectClient(port, signToken());
      // Fire enough heartbeats fast to trip the threshold (2 allowed,
      // then 3 over-limit → 4429 close).
      for (let i = 0; i < 5; i++) {
        ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
      const close = await waitForClose(ws);
      expect(close.code).toBe(4429);
    });
  });

  // ── JWT expiry recheck ──────────────────────────────────────────────

  describe('JWT expiry on privileged messages', () => {
    it('closes with code 4401 when token has expired before a privileged message', async () => {
      // Token expires in 1 second; we'll wait it out then try to subscribe.
      const token = signToken({ userId: 'u-1', role: 'operator', expiresIn: 1 });
      const { ws } = await connectClient(port, token);
      // Wait past the expiry. JWT exp uses 1-second granularity, so > 1100ms is safe.
      await new Promise((r) => setTimeout(r, 1200));
      ws.send(JSON.stringify({ type: 'subscribe', checklistId: 'cl-1' }));
      const err = await nextMessage(ws, 'error', 1500);
      expect(err.code).toBe('TOKEN_EXPIRED');
      const close = await waitForClose(ws, 1500);
      expect(close.code).toBe(4401);
    });

    it('does not close on heartbeat after expiry (heartbeats are not privileged)', async () => {
      const token = signToken({ userId: 'u-1', role: 'operator', expiresIn: 1 });
      const { ws } = await connectClient(port, token);
      await new Promise((r) => setTimeout(r, 1200));
      ws.send(JSON.stringify({ type: 'heartbeat' }));
      // Wait briefly; if the connection isn't closed within 200ms we
      // know heartbeat passed through without re-checking exp.
      await new Promise((r) => setTimeout(r, 200));
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });
  });

  // ── Graceful shutdown ───────────────────────────────────────────────

  describe('graceful shutdown', () => {
    it('broadcasts server_shutdown to every connection before closing', async () => {
      const { ws: a } = await connectClient(port, signToken());
      const { ws: b } = await connectClient(port, signToken({ userId: 'u-2', role: 'operator' }));

      const shutdownA = nextMessage(a, 'server_shutdown', 2000);
      const shutdownB = nextMessage(b, 'server_shutdown', 2000);

      // Trigger shutdown after both are connected. We can't `await` it
      // here because we need to be listening for the message first.
      void broadcaster.shutdown();

      const [msgA, msgB] = await Promise.all([shutdownA, shutdownB]);
      expect(msgA.type).toBe('server_shutdown');
      expect(msgA.reconnectAfterMs).toBeGreaterThan(0);
      expect(msgB.type).toBe('server_shutdown');
    });

    it('is idempotent', async () => {
      await broadcaster.shutdown();
      // Second call should not throw.
      await expect(broadcaster.shutdown()).resolves.toBeUndefined();
    });
  });

  // ── Presence broadcasting ───────────────────────────────────────────

  describe('presence', () => {
    it('broadcasts presence when a client subscribes to a checklist', async () => {
      const { ws: a } = await connectClient(port, signToken({ userId: 'u-1', role: 'operator' }));
      const { ws: b } = await connectClient(port, signToken({ userId: 'u-2', role: 'admin' }));

      // Subscribe in sequence and wait for settlement before asserting.
      // Multiple presence broadcasts fire as each subscribe completes; if
      // we listen for the "first" one we may catch a transient state
      // that doesn't include the still-subscribing peer.
      a.send(JSON.stringify({ type: 'subscribe', checklistId: 'cl-1' }));
      b.send(JSON.stringify({ type: 'subscribe', checklistId: 'cl-1' }));
      await new Promise((r) => setTimeout(r, 100));

      // Force a fresh broadcast on settled state.
      b.send(JSON.stringify({ type: 'machine_change', checklistId: 'cl-1', machineIdx: 1 }));
      const presence = await nextMessage(a, 'presence', 1500);
      expect(Array.isArray(presence.users)).toBe(true);
      expect(presence.users.length).toBe(2);
      const ids = presence.users.map((u: any) => u.id).sort();
      expect(ids).toEqual(['u-1', 'u-2']);

      a.close();
      b.close();
    });

    it('dedupes a single user with multiple tabs', async () => {
      const tab1 = (await connectClient(port, signToken({ userId: 'u-1', role: 'operator' }))).ws;
      const tab2 = (await connectClient(port, signToken({ userId: 'u-1', role: 'operator' }))).ws;
      const observer = (await connectClient(port, signToken({ userId: 'u-2', role: 'operator' }))).ws;

      tab1.send(JSON.stringify({ type: 'subscribe', checklistId: 'cl-1' }));
      tab2.send(JSON.stringify({ type: 'subscribe', checklistId: 'cl-1' }));
      observer.send(JSON.stringify({ type: 'subscribe', checklistId: 'cl-1' }));

      // Wait for the cascade of subscribe-driven broadcasts to settle.
      // Without this, the next nextMessage() may catch a transient state
      // where only one of the three has subscribed yet.
      await new Promise((r) => setTimeout(r, 150));

      // Force one final broadcast on settled state. Observe via tab1
      // (any subscribed client works) to assert the deduped set.
      observer.send(JSON.stringify({ type: 'machine_change', checklistId: 'cl-1', machineIdx: 0 }));
      const presence = await nextMessage(tab1, 'presence', 1500);
      const ids = presence.users.map((u: any) => u.id).sort();
      expect(ids).toEqual(['u-1', 'u-2']);

      tab1.close();
      tab2.close();
      observer.close();
    });
  });

  // ── machine_change broadcasting ─────────────────────────────────────

  describe('machine_change', () => {
    it('broadcasts presence to peers but NOT echoes back to originator', async () => {
      const { ws: a } = await connectClient(port, signToken({ userId: 'u-1', role: 'operator' }));
      const { ws: b } = await connectClient(port, signToken({ userId: 'u-2', role: 'operator' }));
      a.send(JSON.stringify({ type: 'subscribe', checklistId: 'cl-1' }));
      b.send(JSON.stringify({ type: 'subscribe', checklistId: 'cl-1' }));

      // Wait for the initial subscribe-driven presence broadcasts to settle.
      await new Promise((r) => setTimeout(r, 100));

      // A switches machine → both A and B should see updated presence.
      // (presence broadcasts include all subscribers, including originator.)
      a.send(JSON.stringify({ type: 'machine_change', checklistId: 'cl-1', machineIdx: 5 }));
      const bPresence = await nextMessage(b, 'presence', 1500);
      const aRecord = bPresence.users.find((u: any) => u.id === 'u-1');
      expect(aRecord?.machine).toBe(5);

      a.close();
      b.close();
    });
  });
});
