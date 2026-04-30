/**
 * LocalWsBroadcaster
 * -----------------------------------------------------------------------------
 * WebSocket broadcaster used in local/dev mode. It attaches a plain `ws`
 * server to the existing Express HTTP server and implements the same
 * `WebSocketBroadcaster` contract that the API Gateway-backed broadcaster
 * implements in production — so the rest of the backend code doesn't have to
 * know which transport it is talking to.
 *
 * Responsibilities:
 *   - Authenticate incoming WS clients via a JWT passed as `?token=...`.
 *   - Track connected clients in memory (the `connections` map) AND mirror
 *     each connection into DynamoDB so behavior matches production, where
 *     APIGW stores connection records in DynamoDB.
 *   - Route inbound client messages (subscribe / unsubscribe / machine_change
 *     / heartbeat / etc.) and fan out presence + broadcast messages to the
 *     right subset of connections.
 */

import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import type { WebSocketBroadcaster } from './broadcaster.js';
import type { PresenceUser } from './messages.js';
import {
  putConnection,
  deleteConnection,
  updateConnectionSubscription,
  updateConnectionMachine,
  touchConnection,
} from '../data/connections.js';
import { validateClientMessage, type ValidatedClientMessage } from './validate.js';
import { InMemoryRateLimiter, type RateLimiter } from './limiter.js';

// ─── Hardening constants ────────────────────────────────────────────
// All tunable knobs live here so adjustments don't require hunting
// through the connection-handling code. Tests override the timing
// values (ping/pong/rate-limit window) via the constructor options
// so the test suite doesn't have to wait for real-world durations.

/** Drop the connection after this many INVALID_PAYLOAD frames in a row. */
const MAX_STRIKES = 3;
/** How often the server proactively pings each client. */
const DEFAULT_PING_INTERVAL_MS = 15_000;
/** If we don't see a pong within this window, the socket is presumed dead. */
const DEFAULT_PONG_TIMEOUT_MS = 30_000;
/**
 * Hard cap on concurrent open sockets from a single client IP. Normal users
 * have ~2-3 tabs; an attacker opening hundreds gets cut off here long
 * before they can DDoS the server.
 */
const MAX_CONNECTIONS_PER_IP = 10;
/** How long the client should wait before reconnecting after a graceful shutdown. */
const SHUTDOWN_RECONNECT_HINT_MS = 5_000;
/** WS close code used when the JWT has expired mid-session. */
const CLOSE_CODE_TOKEN_EXPIRED = 4401;
/** WS close code used when a client trips the per-IP connection cap. */
const CLOSE_CODE_TOO_MANY_FROM_IP = 4429;
/** WS close code used when a client is closed for repeated invalid frames. */
const CLOSE_CODE_TOO_MANY_STRIKES = 4400;
/** WS close code used when a client trips the per-IP connection cap. */
const CLOSE_CODE_RATE_LIMIT_FLOOD = 4429;
/**
 * Number of rate-limit hits within RATE_LIMIT_HIT_WINDOW_MS that triggers
 * an automatic disconnect. A user occasionally tripping the limit (e.g.
 * spam-clicking once) gets a polite RATE_LIMITED error and keeps going;
 * a sustained flood gets cut off.
 */
const RATE_LIMIT_HIT_THRESHOLD = 3;
/** Sliding window for the rate-limit-hit threshold above. */
const RATE_LIMIT_HIT_WINDOW_MS = 60_000;

/**
 * Origin allowlist for WS upgrades — defaults to the configured frontend
 * origin. In production additional origins (preview deploys, mobile
 * apps) can be added via FRONTEND_ORIGIN_ALLOWLIST as a comma list.
 */
function buildOriginAllowlist(): Set<string> {
  const extras = (process.env.FRONTEND_ORIGIN_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([config.frontendOrigin, ...extras]);
}

/**
 * In-memory record of a single live WebSocket connection.
 * `checklistId` and `activeMachine` are null when the client is viewing
 * the dashboard rather than a specific checklist.
 */
interface LocalConnection {
  ws: WsWebSocket;
  connectionId: string;
  userId: string;
  userName: string;
  userRole: string;
  checklistId: string | null;
  activeMachine: number | null;
  /** Client IP, used for the per-IP cap and audit logging. */
  ip: string;
  /**
   * JWT expiry (epoch seconds). Cached at connect-time so privileged
   * messages can re-check it cheaply without re-verifying the signature.
   */
  tokenExp: number;
  /**
   * Count of consecutive INVALID_PAYLOAD frames. Reset on any valid
   * message; closes the connection at MAX_STRIKES.
   */
  strikes: number;
  /** Wall-clock time of the most recent pong; this.pongTimeoutMs without one → terminate. */
  lastPongAt: number;
  /**
   * Recent rate-limit-hit timestamps (ms). Used to enforce the
   * "RATE_LIMIT_HIT_THRESHOLD hits within RATE_LIMIT_HIT_WINDOW_MS →
   * close" rule without scanning the whole event log. Pruned on every
   * push so the array stays bounded.
   */
  rateLimitHits: number[];
}

// Monotonic counter used to generate human-readable local connection IDs
// (e.g. "local-1", "local-2"). Only meaningful within a single process.
let nextConnId = 1;

/**
 * Constructor-time overrides. Production code passes nothing and gets
 * the safe defaults; tests pass tightened timings so the suite doesn't
 * have to wait 30 seconds to verify a single ping/pong death scenario.
 */
export interface LocalWsBroadcasterOptions {
  pingIntervalMs?: number;
  pongTimeoutMs?: number;
}

export class LocalWsBroadcaster implements WebSocketBroadcaster {
  private readonly pingIntervalMs: number;
  private readonly pongTimeoutMs: number;

  constructor(options: LocalWsBroadcasterOptions = {}) {
    this.pingIntervalMs = options.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
    this.pongTimeoutMs = options.pongTimeoutMs ?? DEFAULT_PONG_TIMEOUT_MS;
  }

  // Source of truth for live sockets in this process. Maps connectionId -> connection.
  private connections = new Map<string, LocalConnection>();
  // Per-IP set of connectionIds for enforcing MAX_CONNECTIONS_PER_IP. Cheap
  // to maintain incrementally; keeps the IP cap O(1) on connect.
  private connectionsByIp = new Map<string, Set<string>>();
  private wss: WebSocketServer | null = null;
  // Periodic ping driver — checks pong freshness and emits new pings.
  // Note: there is no presence-broadcast interval. Presence updates are
  // event-driven (see init() comment for rationale).
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  // Origin allowlist computed once at startup; rejects WS upgrades from
  // any other origin in `verifyClient` before we even authenticate.
  private allowedOrigins: Set<string> = buildOriginAllowlist();
  // Latched once `shutdown()` runs so handlers can short-circuit gracefully.
  private shuttingDown = false;
  // SIGTERM handler reference, retained so it can be unregistered (mostly
  // matters for tests that boot multiple broadcasters in one process).
  private sigtermHandler: (() => void) | null = null;
  // Per-(userId, messageType) rate limiter. In-memory for local dev;
  // production will swap in the DynamoDB-backed implementation.
  private rateLimiter: RateLimiter = new InMemoryRateLimiter();

  /**
   * Attach the WebSocket server to the given HTTP server on path `/ws`,
   * wire up the connection handler, start the periodic presence
   * summary + ping drivers, and register the SIGTERM hook for graceful
   * shutdown.
   */
  init(server?: HttpServer): void {
    if (!server) throw new Error('LocalWsBroadcaster requires an HTTP server');
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      // Reject upgrades from disallowed origins BEFORE we burn JWT-verify
      // CPU on a request that was never going to be served. The
      // `Origin` header is sent by browsers; non-browser clients (curl,
      // server-to-server) typically omit it — allow those through and
      // rely on JWT auth to gate them.
      verifyClient: (info, cb) => {
        const origin = info.origin;
        if (!origin || this.allowedOrigins.has(origin)) {
          cb(true);
          return;
        }
        cb(false, 403, 'Forbidden origin');
      },
    });

    this.wss.on('connection', (ws: WsWebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    // Presence is broadcast event-driven, not polled — see the message
    // handlers below for `subscribe`, `unsubscribe`, `machine_change`,
    // and the `close` listener. The previous 10-second `setInterval`
    // was removed in the delta-presence migration: it pushed identical
    // presence summaries to every dashboard viewer regardless of
    // change, costing ~600 outbound messages/min at 100 admins for
    // zero benefit. Critically, a `setInterval` cannot run on Lambda
    // (no persistent process), so the polled model was incompatible
    // with the production hosting target anyway.

    // Server-side liveness driver. Two responsibilities:
    //   1. Reap connections whose last pong is older than this.pongTimeoutMs.
    //      This eliminates the previous "ghost user up to 30 minutes"
    //      problem (tab crashed, no clean close).
    //   2. Send a fresh ping to every still-alive connection so the next
    //      tick has fresh pong evidence.
    this.pingInterval = setInterval(() => {
      const cutoff = Date.now() - this.pongTimeoutMs;
      for (const conn of this.connections.values()) {
        if (conn.lastPongAt < cutoff) {
          // No pong inside the window → the socket is presumed dead.
          // `terminate()` skips the close handshake (the client is gone
          // anyway), and the 'close' handler still runs cleanup.
          conn.ws.terminate();
          continue;
        }
        if (conn.ws.readyState === WsWebSocket.OPEN) {
          conn.ws.ping();
        }
      }
    }, this.pingIntervalMs);

    // SIGTERM is what container orchestrators (Fargate, Kubernetes, even
    // local `kill`) send before shutting a process down. Use it to give
    // every connected client a heads-up so the frontend can show a
    // "reconnecting" UI instead of a generic disconnect error.
    this.sigtermHandler = () => {
      this.shutdown().catch(() => {});
    };
    process.on('SIGTERM', this.sigtermHandler);
  }

  /**
   * Drain every open connection, send a `server_shutdown` notice with
   * a reconnect hint, then close the underlying server. Idempotent —
   * subsequent calls become no-ops.
   */
  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = null;

    const notice = JSON.stringify({
      type: 'server_shutdown',
      reconnectAfterMs: SHUTDOWN_RECONNECT_HINT_MS,
    });
    for (const conn of this.connections.values()) {
      if (conn.ws.readyState === WsWebSocket.OPEN) {
        try {
          conn.ws.send(notice);
        } catch {
          // Best-effort — a socket can transition to CLOSING between
          // the readyState check and the send.
        }
        conn.ws.close(1001, 'server_shutdown');
      }
    }
    this.connections.clear();
    this.connectionsByIp.clear();

    await new Promise<void>((resolve) => {
      if (!this.wss) return resolve();
      this.wss.close(() => resolve());
    });

    if (this.sigtermHandler) {
      process.removeListener('SIGTERM', this.sigtermHandler);
      this.sigtermHandler = null;
    }
  }

  /**
   * Handle a new incoming WS connection: validate JWT, resolve the user,
   * register the connection both in memory and in DynamoDB, and set up
   * message / close listeners.
   */
  private async handleConnection(ws: WsWebSocket, req: IncomingMessage): Promise<void> {
    // ── IP extraction + per-IP cap ────────────────────────────────
    // `req.socket.remoteAddress` is the immediate peer; behind a load
    // balancer the original client IP is in `x-forwarded-for`. Use the
    // first entry if XFF is present (the LB appends as it forwards).
    const xff = req.headers['x-forwarded-for'];
    const xffFirst = Array.isArray(xff) ? xff[0] : (typeof xff === 'string' ? xff.split(',')[0]?.trim() : undefined);
    const ip = xffFirst || req.socket.remoteAddress || 'unknown';
    const ipBucket = this.connectionsByIp.get(ip);
    if (ipBucket && ipBucket.size >= MAX_CONNECTIONS_PER_IP) {
      // Refuse politely instead of just dropping the socket so the client
      // can surface a useful error (and so this shows up in audit logs).
      try {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Too many connections from this IP',
          code: 'RATE_LIMITED',
        }));
      } catch { /* socket may already be closed */ }
      ws.close(CLOSE_CODE_TOO_MANY_FROM_IP, 'too_many_from_ip');
      return;
    }

    // ── Auth ──────────────────────────────────────────────────────
    // The browser `WebSocket` API does not support custom headers, so the
    // JWT is passed as a `token` query parameter instead of Authorization.
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.send(JSON.stringify({ type: 'error', message: 'No token provided' }));
      ws.close();
      return;
    }

    // Verify the JWT. Any failure (expired, bad signature, malformed) is
    // treated the same way: tell the client and drop the connection.
    // `exp` is captured so privileged messages can re-check expiry without
    // a fresh signature verification on every frame.
    let decoded: { userId: string; role: string; exp?: number };
    try {
      decoded = jwt.verify(token, config.jwtSecret) as { userId: string; role: string; exp?: number };
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
      ws.close();
      return;
    }
    // JWT must carry an `exp` — we always sign with one, but defending
    // against a malformed payload is cheap.
    const tokenExp = typeof decoded.exp === 'number'
      ? decoded.exp
      : Math.floor(Date.now() / 1000) + 8 * 60 * 60;

    // Dynamic import avoids a circular dependency between the WS layer and
    // the DynamoDB data layer at module load time.
    const { getUser } = await import('../data/dynamo.js');
    const user = await getUser(decoded.userId);
    const userName = user?.name || 'Unknown';

    const connectionId = `local-${nextConnId++}`;
    const conn: LocalConnection = {
      ws,
      connectionId,
      userId: decoded.userId,
      userName,
      userRole: decoded.role,
      checklistId: null,
      activeMachine: null,
      ip,
      tokenExp,
      strikes: 0,
      // Treat the new connection as "just ponged" so the next ping cycle
      // gives it a full this.pongTimeoutMs to respond before being reaped.
      lastPongAt: Date.now(),
      rateLimitHits: [],
    };

    this.connections.set(connectionId, conn);
    if (!ipBucket) {
      this.connectionsByIp.set(ip, new Set([connectionId]));
    } else {
      ipBucket.add(connectionId);
    }

    // Mirror the connection into DynamoDB so code paths that read from the
    // Connections table (e.g. audit, cross-instance lookups) behave the
    // same in local dev as they do in prod with API Gateway.
    const now = new Date().toISOString();
    await putConnection({
      connectionId,
      userId: decoded.userId,
      userName,
      userRole: decoded.role,
      checklistId: null,
      activeMachine: null,
      channel: 'dashboard',
      connectedAt: now,
      lastActivity: now,
      // 30-minute TTL — DynamoDB backstop if our `close` handler is missed.
      // The 30s ping/pong reaper is the primary mechanism now; TTL is just
      // belt-and-suspenders for catastrophic failures (process crash).
      ttl: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    // Confirm the handshake so the client can move from "connecting" to "ready".
    ws.send(JSON.stringify({ type: 'connected', userId: decoded.userId, connectionId }));

    // Pong handler — the `ws` library emits 'pong' for both client-replies
    // to our pings and unsolicited keepalives. Either one is sufficient
    // proof of life for the reaper.
    ws.on('pong', () => {
      conn.lastPongAt = Date.now();
    });

    // Inbound message pump. Two layers of defense:
    //   1. Schema validation (strikes counter, MAX_STRIKES in a row → close).
    //   2. Rate limiting via token bucket (per (userId, messageType));
    //      RATE_LIMIT_HIT_THRESHOLD hits in RATE_LIMIT_HIT_WINDOW_MS → close.
    // Both layers report back with structured error codes so a polite
    // client can self-correct instead of guessing.
    ws.on('message', (data) => {
      void (async () => {
        const result = validateClientMessage(data);
        if (!result.ok) {
          conn.strikes += 1;
          try {
            ws.send(JSON.stringify({
              type: 'error',
              message: result.reason,
              code: result.code,
            }));
          } catch { /* socket may already be closed */ }
          if (conn.strikes >= MAX_STRIKES) {
            try {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Too many invalid messages',
                code: 'TOO_MANY_STRIKES',
              }));
            } catch { /* ignore */ }
            ws.close(CLOSE_CODE_TOO_MANY_STRIKES, 'too_many_strikes');
          }
          return;
        }
        // Any valid message resets the strike counter; a well-behaved
        // client shouldn't be punished forever for a single bad frame.
        conn.strikes = 0;

        // Rate-limit gate. Buckets are per-user, not per-connection, so a
        // client can't farm extra capacity by churning sockets.
        const decision = await this.rateLimiter.checkAndConsume(conn.userId, result.msg.type);
        if (!decision.allowed) {
          // Record the hit; prune entries older than the window.
          const now = Date.now();
          conn.rateLimitHits.push(now);
          conn.rateLimitHits = conn.rateLimitHits.filter((t) => now - t < RATE_LIMIT_HIT_WINDOW_MS);

          try {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Rate limited',
              code: 'RATE_LIMITED',
              retryAfterMs: decision.retryAfterMs,
            }));
          } catch { /* ignore */ }

          if (conn.rateLimitHits.length >= RATE_LIMIT_HIT_THRESHOLD) {
            try {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Sustained rate-limit flood',
                code: 'RATE_LIMITED',
              }));
            } catch { /* ignore */ }
            ws.close(CLOSE_CODE_RATE_LIMIT_FLOOD, 'rate_limit_flood');
          }
          return;
        }

        this.handleMessage(connectionId, result.msg).catch(() => {});
      })();
    });

    // On disconnect: remove from both memory and DynamoDB, decrement IP
    // counter, and notify peers watching the same checklist that presence
    // has changed.
    ws.on('close', () => {
      const oldChecklistId = conn.checklistId;
      this.connections.delete(connectionId);
      const bucket = this.connectionsByIp.get(conn.ip);
      if (bucket) {
        bucket.delete(connectionId);
        if (bucket.size === 0) this.connectionsByIp.delete(conn.ip);
      }
      deleteConnection(connectionId).catch(() => {});
      if (oldChecklistId) {
        this.broadcastPresence(oldChecklistId).catch(() => {});
      }
      this.broadcastPresenceSummary().catch(() => {});
    });
  }

  /**
   * Set of message types that mutate server-side state on behalf of the
   * authenticated user. We re-check JWT expiry on these so a long-lived
   * connection can't outlive the token's validity window.
   *
   * `heartbeat`, `idle`, `subscribe_dashboard`, `unsubscribe_dashboard`
   * are intentionally omitted — they're either pure liveness signals or
   * read-only channel changes, and forcing reauth on heartbeats would
   * cause spurious disconnects right before a token refresh.
   */
  private static readonly PRIVILEGED_MESSAGE_TYPES = new Set<ValidatedClientMessage['type']>([
    'subscribe',
    'unsubscribe',
    'machine_change',
  ]);

  /**
   * Route a single (already-validated) client message based on its `type`
   * discriminator and update presence accordingly. Privileged messages
   * additionally re-check JWT expiry; if the token has aged past its `exp`,
   * the connection is closed with code CLOSE_CODE_TOKEN_EXPIRED so the
   * client knows to reconnect with a fresh token.
   */
  private async handleMessage(connectionId: string, msg: ValidatedClientMessage): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    if (LocalWsBroadcaster.PRIVILEGED_MESSAGE_TYPES.has(msg.type)) {
      // Compare against `exp` (epoch seconds) rather than re-running
      // jwt.verify — same correctness guarantee, no signature CPU on
      // every message.
      if (Math.floor(Date.now() / 1000) >= conn.tokenExp) {
        try {
          conn.ws.send(JSON.stringify({
            type: 'error',
            message: 'Token expired',
            code: 'TOKEN_EXPIRED',
          }));
        } catch { /* ignore */ }
        conn.ws.close(CLOSE_CODE_TOKEN_EXPIRED, 'token_expired');
        return;
      }
    }

    switch (msg.type) {
      case 'subscribe': {
        // Client is now viewing a specific checklist. Default to machine 0
        // so presence has something meaningful to show until the client
        // emits a `machine_change`.
        const oldChecklistId = conn.checklistId;
        conn.checklistId = msg.checklistId;
        conn.activeMachine = 0;
        await updateConnectionSubscription(connectionId, msg.checklistId, 0);
        // If the user switched from one checklist to another, the old
        // checklist's viewers also need a presence refresh so they see
        // this user leave.
        if (oldChecklistId && oldChecklistId !== msg.checklistId) {
          await this.broadcastPresence(oldChecklistId);
        }
        await this.broadcastPresence(msg.checklistId);
        await this.broadcastPresenceSummary();
        break;
      }
      case 'unsubscribe': {
        // Client left a checklist (e.g. navigated to the dashboard).
        conn.checklistId = null;
        conn.activeMachine = null;
        await updateConnectionSubscription(connectionId, null, null);
        await this.broadcastPresence(msg.checklistId);
        await this.broadcastPresenceSummary();
        break;
      }
      case 'machine_change': {
        // User is editing a different machine within the same checklist.
        // The per-checklist presence message reflects the new machine
        // assignment; the dashboard summary also includes per-user
        // machine, so it needs the same refresh.
        // (Pre-delta-presence this was implicit via the 10-second
        // setInterval — now that the interval is gone, every membership
        // mutation broadcasts explicitly.)
        conn.activeMachine = msg.machineIdx;
        await updateConnectionMachine(connectionId, msg.machineIdx);
        await this.broadcastPresence(msg.checklistId);
        await this.broadcastPresenceSummary();
        break;
      }
      case 'subscribe_dashboard': {
        // Local mode puts every connection on the dashboard channel by
        // default, so this is a no-op. The branch exists for API-shape
        // parity with the production APIGW broadcaster.
        break;
      }
      case 'unsubscribe_dashboard': {
        break;
      }
      case 'heartbeat': {
        // Refresh the connection's DynamoDB record so it doesn't expire
        // under the TTL while the client is still active.
        await touchConnection(connectionId);
        break;
      }
      case 'idle': {
        // Client told us it's going idle and will close the socket itself;
        // nothing to do here — the `close` handler will clean up.
        break;
      }
    }
  }

  /**
   * Send `message` to every connection currently subscribed to
   * `checklistId`, optionally skipping the user identified by
   * `excludeUserId` (useful to avoid echoing a user's own action back
   * to their own tabs).
   */
  async broadcastToChecklist(checklistId: string, message: object, excludeUserId?: string): Promise<void> {
    const msg = JSON.stringify(message);
    for (const conn of this.connections.values()) {
      if (conn.checklistId === checklistId && conn.userId !== excludeUserId) {
        // Only send on sockets that are actually open; skipping a socket
        // mid-close avoids "WebSocket is not open" errors.
        if (conn.ws.readyState === WsWebSocket.OPEN) {
          conn.ws.send(msg);
        }
      }
    }
  }

  /**
   * Emit a `presence` message listing the distinct users currently
   * viewing `checklistId` to everyone subscribed to that checklist.
   */
  async broadcastPresence(checklistId: string): Promise<void> {
    const users: PresenceUser[] = [];
    for (const conn of this.connections.values()) {
      if (conn.checklistId === checklistId) {
        users.push({
          id: conn.userId,
          name: conn.userName,
          role: conn.userRole,
          machine: conn.activeMachine,
        });
      }
    }
    // A user with multiple tabs open will produce multiple connections.
    // Collapse them to one entry so the UI doesn't show "Alice, Alice, Alice".
    const seen = new Set<string>();
    const deduped = users.filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

    const msg = JSON.stringify({ type: 'presence', checklistId, users: deduped });
    for (const conn of this.connections.values()) {
      if (conn.checklistId === checklistId && conn.ws.readyState === WsWebSocket.OPEN) {
        conn.ws.send(msg);
      }
    }
  }

  /**
   * Broadcast a single aggregated map of `checklistId -> users` to all
   * connections so the admin dashboard can render a bird's-eye view of
   * who is working on what. Skipped entirely when no one is currently
   * subscribed to any checklist.
   */
  async broadcastPresenceSummary(): Promise<void> {
    const checklists: Record<string, PresenceUser[]> = {};
    // Per-checklist set of already-counted userIds, used to dedupe users
    // with multiple open tabs.
    const seen = new Map<string, Set<string>>();

    for (const conn of this.connections.values()) {
      if (!conn.checklistId) continue;
      if (!checklists[conn.checklistId]) {
        checklists[conn.checklistId] = [];
        seen.set(conn.checklistId, new Set());
      }
      const userSet = seen.get(conn.checklistId)!;
      if (userSet.has(conn.userId)) continue;
      userSet.add(conn.userId);
      checklists[conn.checklistId].push({
        id: conn.userId,
        name: conn.userName,
        role: conn.userRole,
        machine: conn.activeMachine,
      });
    }

    // Nothing to report — don't spam clients with empty payloads.
    if (Object.keys(checklists).length === 0) return;

    const msg = JSON.stringify({ type: 'presence_summary', checklists });
    for (const conn of this.connections.values()) {
      // Fan out to every open connection; dashboard viewers render it,
      // checklist viewers simply ignore it client-side.
      if (conn.ws.readyState === WsWebSocket.OPEN) {
        conn.ws.send(msg);
      }
    }
  }

  /**
   * Push `message` to every open connection. Intended for dashboard-wide
   * events (e.g. a checklist was submitted); the frontend decides
   * whether it cares based on the current route.
   */
  async broadcastToDashboard(message: object): Promise<void> {
    const msg = JSON.stringify(message);
    for (const conn of this.connections.values()) {
      if (conn.ws.readyState === WsWebSocket.OPEN) {
        conn.ws.send(msg);
      }
    }
  }

  /**
   * Return the distinct set of users currently viewing `checklistId`.
   * Used by HTTP endpoints that want a one-shot presence snapshot
   * rather than subscribing to updates.
   */
  async getChecklistPresence(checklistId: string): Promise<PresenceUser[]> {
    const users: PresenceUser[] = [];
    const seen = new Set<string>();
    for (const conn of this.connections.values()) {
      // Dedupe on userId the same way `broadcastPresence` does so the
      // snapshot agrees with what live subscribers see.
      if (conn.checklistId === checklistId && !seen.has(conn.userId)) {
        seen.add(conn.userId);
        users.push({
          id: conn.userId,
          name: conn.userName,
          role: conn.userRole,
          machine: conn.activeMachine,
        });
      }
    }
    return users;
  }
}
