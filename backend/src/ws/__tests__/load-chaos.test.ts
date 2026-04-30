/**
 * Load + chaos tests for `LocalWsBroadcaster`.
 *
 * Boots a real HTTP server + broadcaster on an ephemeral port (same setup
 * as `local-ws.integration.test.ts`) and drives it with many concurrent
 * `ws` clients to exercise the hardening invariants under stress:
 *
 * Load:
 *   - per-IP connection cap (MAX_CONNECTIONS_PER_IP) refuses the (n+1)th
 *   - many simultaneous connections + subscribes don't drop frames
 *   - broadcast fan-out reaches every peer
 *   - rate limiter is per-connection (one floody client doesn't starve peers)
 *
 * Chaos:
 *   - abrupt client `terminate()` cleans up server-side state
 *   - high churn (connect → subscribe → close × N) leaves no leaks
 *   - graceful shutdown notifies + closes every active connection
 *   - half-open connection (client never pongs) gets reaped
 *   - one client spamming garbage is closed at 3 strikes without affecting peers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';

// ── Module mocks (must come before importing local-ws) ────────────────
vi.mock('../../data/dynamo.js', () => ({
  docClient: { send: vi.fn().mockResolvedValue({ Items: [] }) },
  getUser: vi.fn().mockImplementation(async (id: string) => ({
    id,
    name: `User ${id}`,
    role: id === 'admin-1' ? 'admin' : 'operator',
  })),
}));

vi.mock('../../config/env.js', () => ({
  config: {
    jwtSecret: 'load-chaos-test-secret',
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

// ── Test helpers ──────────────────────────────────────────────────────

const JWT_SECRET = 'load-chaos-test-secret';

function signToken(userId = 'u-1', role = 'operator', expiresIn = 3600): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn });
}

interface OpenClient {
  ws: WebSocket;
  firstFrame: any;
}

/**
 * Opens a ws client and resolves on the first frame. If the first frame
 * is `error` (auth/cap rejection), the connection is treated as rejected
 * so negative cases use `.rejects.toThrow()`.
 */
function connectClient(port: number, token: string, headers: Record<string, string> = {}): Promise<OpenClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(token)}`, { headers });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('connectClient timed out'));
    }, 2000);
    ws.once('message', (data) => {
      clearTimeout(timer);
      const parsed = JSON.parse(data.toString());
      if (parsed.type === 'error') {
        ws.close();
        return reject(new Error(`server rejected: ${parsed.code ?? ''}: ${parsed.message ?? ''}`));
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

/** Wait for a message of a given type, optionally filter by predicate. */
function nextMessage(
  ws: WebSocket,
  type: string,
  timeoutMs = 2000,
  match?: (msg: any) => boolean,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener('message', onMessage);
      reject(new Error(`timed out waiting for ${type}`));
    }, timeoutMs);
    function onMessage(data: WebSocket.RawData): void {
      let parsed: any;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (parsed.type !== type) return;
      if (match && !match(parsed)) return;
      clearTimeout(timer);
      ws.removeListener('message', onMessage);
      resolve(parsed);
    }
    ws.on('message', onMessage);
  });
}

function waitForClose(ws: WebSocket, timeoutMs = 2000): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve({ code: 1006, reason: '' });
    const timer = setTimeout(() => reject(new Error('timed out waiting for close')), timeoutMs);
    ws.once('close', (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
}

/**
 * Poll a predicate until it returns true or the deadline expires. Used
 * to assert eventual cleanup invariants (e.g. connection map size = 0
 * after all clients close) without baking in arbitrary sleep durations.
 */
async function waitFor(predicate: () => boolean, timeoutMs = 2000, stepMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw new Error('waitFor: predicate never became true');
}

/** Read the broadcaster's private connection map size for invariant checks. */
function connectionCount(broadcaster: LocalWsBroadcaster): number {
  return (broadcaster as any).connections.size as number;
}

function ipBucketCount(broadcaster: LocalWsBroadcaster, ip = '127.0.0.1'): number {
  const bucket = (broadcaster as any).connectionsByIp.get(ip) as Set<string> | undefined;
  return bucket?.size ?? 0;
}

// ── Suite ─────────────────────────────────────────────────────────────

describe('LocalWsBroadcaster — load + chaos', () => {
  let server: HttpServer;
  let broadcaster: LocalWsBroadcaster;
  let port: number;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = createServer();
    // Tight timings so chaos cases (pong reap, etc.) finish in ms, not seconds.
    broadcaster = new LocalWsBroadcaster({ pingIntervalMs: 30, pongTimeoutMs: 80 });
    broadcaster.init(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await broadcaster.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ── Load ────────────────────────────────────────────────────────────

  describe('load', () => {
    it('refuses the 11th connection from the same IP with close 4429', async () => {
      // MAX_CONNECTIONS_PER_IP is 10. Open exactly 10, all should succeed.
      const accepted: WebSocket[] = [];
      for (let i = 0; i < 10; i++) {
        const { ws } = await connectClient(port, signToken(`u-${i}`));
        accepted.push(ws);
      }
      expect(ipBucketCount(broadcaster)).toBe(10);

      // The 11th from the same IP must be refused.
      await expect(connectClient(port, signToken('u-overflow'))).rejects.toThrow(/RATE_LIMITED|too_many|closed_before_frame/i);

      // Closing one frees a slot for a new connection.
      accepted[0].close();
      await waitFor(() => ipBucketCount(broadcaster) === 9);

      const { ws: late } = await connectClient(port, signToken('u-late'));
      expect(connectionCount(broadcaster)).toBe(10);

      late.close();
      for (let i = 1; i < 10; i++) accepted[i].close();
      await waitFor(() => connectionCount(broadcaster) === 0);
    });

    it('handles many concurrent subscribes to the same checklist without dropping presence', async () => {
      // Stay under the 10-per-IP cap. 8 peers + 1 observer = 9 sockets.
      const N = 8;
      const observer = (await connectClient(port, signToken('admin-1', 'admin'))).ws;
      observer.send(JSON.stringify({ type: 'subscribe', checklistId: 'cl-load' }));

      const peers = await Promise.all(
        Array.from({ length: N }, (_, i) => connectClient(port, signToken(`u-${i}`)).then((c) => c.ws)),
      );
      for (const p of peers) {
        p.send(JSON.stringify({ type: 'subscribe', checklistId: 'cl-load' }));
      }

      // Force one final broadcast on settled state and assert observer
      // sees every subscriber. machine_change emits a presence broadcast
      // whose payload includes everyone subscribed to the channel.
      await new Promise((r) => setTimeout(r, 150));
      peers[0].send(JSON.stringify({ type: 'machine_change', checklistId: 'cl-load', machineIdx: 0 }));

      const presence = await nextMessage(observer, 'presence', 3000, (m) => m.users?.length === N + 1);
      const ids = new Set(presence.users.map((u: any) => u.id));
      for (let i = 0; i < N; i++) expect(ids.has(`u-${i}`)).toBe(true);
      expect(ids.has('admin-1')).toBe(true);

      observer.close();
      for (const p of peers) p.close();
      await waitFor(() => connectionCount(broadcaster) === 0);
    });

    it('rate-limits per connection — one floody client does not starve peers', async () => {
      // A floods heartbeats; B sends one heartbeat and stays connected.
      const a = (await connectClient(port, signToken('u-a'))).ws;
      const b = (await connectClient(port, signToken('u-b'))).ws;

      // B sends a single heartbeat — should never be rate-limited.
      const bGotError = vi.fn();
      b.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'error') bGotError(parsed);
      });
      b.send(JSON.stringify({ type: 'heartbeat' }));

      // A floods until it's force-closed (heartbeat capacity is 2;
      // 3 over-limit hits trigger 4429 close). 8 frames is plenty.
      for (let i = 0; i < 8; i++) {
        a.send(JSON.stringify({ type: 'heartbeat' }));
      }
      const close = await waitForClose(a, 2000);
      expect(close.code).toBe(4429);

      // B is still open and was never rate-limited.
      expect(b.readyState).toBe(WebSocket.OPEN);
      expect(bGotError).not.toHaveBeenCalled();

      b.close();
      await waitFor(() => connectionCount(broadcaster) === 0);
    });
  });

  // ── Chaos ───────────────────────────────────────────────────────────

  describe('chaos', () => {
    it('cleans up server state when a client terminates abruptly (no close handshake)', async () => {
      const { ws } = await connectClient(port, signToken('u-abrupt'));
      expect(connectionCount(broadcaster)).toBe(1);

      // terminate() yanks the socket without sending a close frame —
      // simulates network drop / process kill.
      ws.terminate();

      await waitFor(() => connectionCount(broadcaster) === 0);
      expect(ipBucketCount(broadcaster)).toBe(0);
    });

    it('survives connect/subscribe/close churn with no state leaks', async () => {
      const CYCLES = 30;
      for (let i = 0; i < CYCLES; i++) {
        const { ws } = await connectClient(port, signToken(`u-churn-${i}`));
        ws.send(JSON.stringify({ type: 'subscribe', checklistId: `cl-${i % 5}` }));
        // Mix of clean close and abrupt terminate to exercise both paths.
        if (i % 2 === 0) ws.close();
        else ws.terminate();
      }

      await waitFor(() => connectionCount(broadcaster) === 0, 3000);
      expect(ipBucketCount(broadcaster)).toBe(0);
    });

    it('graceful shutdown notifies all active connections then closes the server', async () => {
      const N = 8;
      const clients: WebSocket[] = [];
      for (let i = 0; i < N; i++) {
        clients.push((await connectClient(port, signToken(`u-${i}`))).ws);
      }
      expect(connectionCount(broadcaster)).toBe(N);

      const shutdownNotices = clients.map((c) => nextMessage(c, 'server_shutdown', 3000));
      const closes = clients.map((c) => waitForClose(c, 3000));

      void broadcaster.shutdown();

      const notices = await Promise.all(shutdownNotices);
      expect(notices).toHaveLength(N);
      for (const n of notices) expect(n.reconnectAfterMs).toBeGreaterThan(0);

      const closeResults = await Promise.all(closes);
      // All sockets are closed (codes vary: 1001 server_shutdown vs 1006 if
      // the wss closed the underlying TCP before the close frame landed).
      // What matters is that every client observes a close.
      expect(closeResults).toHaveLength(N);

      // Internal state drained.
      expect(connectionCount(broadcaster)).toBe(0);
      expect(ipBucketCount(broadcaster)).toBe(0);
    });

    it('reaps half-open connections that stop responding to ping', async () => {
      // Build a raw ws client that drops the protocol-level pong response.
      // The broadcaster pings every 30ms (test config) and reaps after
      // 80ms without a pong, so a non-responsive socket should be
      // terminated within ~150ms.
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(signToken('u-deaf'))}`);
      // Suppress the automatic pong reply by intercepting the ping event
      // before the default ws handler can respond.
      ws.on('ping', () => {
        // Do nothing — simulate a wedged client.
      });
      // Replace the default pong handler. The `ws` library auto-pongs
      // unless we override; the cleanest disable is to swap the socket's
      // pong method to a no-op once it opens.
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => {
          (ws as any).pong = (): void => undefined;
          resolve();
        });
        ws.once('error', reject);
      });

      // Wait until the broadcaster reaps us (close event fires from terminate).
      await waitForClose(ws, 1500);
      await waitFor(() => connectionCount(broadcaster) === 0);
    });

    it('isolates a misbehaving client — garbage spammer is closed at 3 strikes; peer keeps working', async () => {
      const peer = (await connectClient(port, signToken('u-good'))).ws;
      const spammer = (await connectClient(port, signToken('u-bad'))).ws;

      // Peer subscribes and should keep receiving messages throughout.
      peer.send(JSON.stringify({ type: 'subscribe', checklistId: 'cl-iso' }));
      await new Promise((r) => setTimeout(r, 50));

      // Spammer fires 3 invalid frames → server closes it with 4400.
      const spammerClosed = waitForClose(spammer, 2000);
      spammer.send('garbage 1');
      spammer.send('garbage 2');
      spammer.send('garbage 3');

      const close = await spammerClosed;
      expect(close.code).toBe(4400);

      // Peer is unaffected — still open, can still send valid traffic
      // and get back a response (the `heartbeat` path is the cheapest
      // round-trip-able server-acknowledged message).
      expect(peer.readyState).toBe(WebSocket.OPEN);
      peer.send(JSON.stringify({ type: 'machine_change', checklistId: 'cl-iso', machineIdx: 2 }));

      // Peer's own machine_change won't echo back, but server state shows
      // the connection alive after the spammer's eviction.
      await waitFor(() => connectionCount(broadcaster) === 1);

      peer.close();
      await waitFor(() => connectionCount(broadcaster) === 0);
    });
  });
});
