/**
 * Per-connection WebSocket rate limiter.
 *
 * Implements a token-bucket per `(userId, messageType)` so an abusive or
 * buggy client can't flood the server with one type of message while a
 * well-behaved tab on the same account keeps working normally.
 *
 * Why token buckets, not fixed windows:
 *   - A 100-msg/min fixed window would let a client send 100 in the last
 *     second of one window and 100 in the first second of the next —
 *     instant 200/2-second burst with the limit nominally honored.
 *   - A token bucket caps both steady-state rate AND burst size.
 *
 * Adapter pattern (to mirror `WebSocketBroadcaster`):
 *   - `InMemoryRateLimiter` — local dev, single-process. State lives in a
 *     plain Map; gets wiped on restart.
 *   - `DynamoDbRateLimiter` — TODO for production. Each Lambda invocation
 *     is a fresh container, so memory state is useless; a DynamoDB-backed
 *     atomic counter is the canonical store for multi-instance prod.
 */

/** Bucket parameters for a single message type. */
interface BucketSpec {
  /** Max tokens the bucket can hold (= max burst size). */
  capacity: number;
  /** Tokens added per second. The steady-state allowed rate. */
  refillPerSec: number;
}

/**
 * Per-message-type quotas. Numbers come straight from the bulletproofing
 * plan; tuning these is a config exercise, not a code change. Anything
 * not listed here is allowed without limiting (defensive default — adding
 * a new message type doesn't accidentally lock the whole feature behind
 * a missing-spec error).
 */
const BUCKET_SPECS: Record<string, BucketSpec> = {
  // 5/sec steady state, burst of 20. Matches typical "operator clicking
  // checkboxes fast" while throttling runaway client bugs.
  machine_change: { capacity: 20, refillPerSec: 5 },
  // 10/min — page navigation, not a hot path. Burst 30 covers a tab
  // briefly toggling between several checklists.
  subscribe: { capacity: 30, refillPerSec: 10 / 60 },
  unsubscribe: { capacity: 30, refillPerSec: 10 / 60 },
  // 1 every 30s — heartbeats are automatic on a 60s interval; anything
  // faster than this means a buggy or hostile client.
  heartbeat: { capacity: 2, refillPerSec: 1 / 30 },
  idle: { capacity: 2, refillPerSec: 1 / 30 },
  // Admin tab open/close events. Admins generally don't switch this fast.
  subscribe_dashboard: { capacity: 10, refillPerSec: 5 / 60 },
  unsubscribe_dashboard: { capacity: 10, refillPerSec: 5 / 60 },
};

/** Result of a single rate-limit check. */
export interface RateLimitDecision {
  allowed: boolean;
  /** Populated only when allowed=false. Suggested backoff window for the client. */
  retryAfterMs?: number;
}

/** Storage-agnostic interface so the broadcaster doesn't care which backend is in use. */
export interface RateLimiter {
  checkAndConsume(userId: string, messageType: string): Promise<RateLimitDecision>;
}

interface BucketState {
  tokens: number;
  /** Wall-clock ms of the last refill (for the lazy refill calculation). */
  lastRefill: number;
}

/**
 * Single-process, in-memory token bucket. Suitable for local dev and the
 * always-on `npm run dev` server. Not safe across multiple instances —
 * each Node process would track its own buckets, and a client could
 * round-robin between them to bypass limits.
 */
export class InMemoryRateLimiter implements RateLimiter {
  // `${userId}:${messageType}` -> bucket state. Stored on the limiter
  // (not the connection) so closing one tab doesn't reset the user's
  // budget for messages sent from another tab — an attacker can't
  // farm extra capacity by churning sockets.
  private buckets = new Map<string, BucketState>();

  async checkAndConsume(userId: string, messageType: string): Promise<RateLimitDecision> {
    const spec = BUCKET_SPECS[messageType];
    if (!spec) return { allowed: true };

    const key = `${userId}:${messageType}`;
    const now = Date.now();
    let state = this.buckets.get(key);
    if (!state) {
      // Fresh bucket starts full so a user's first action never gets rate
      // limited just because they connected recently.
      state = { tokens: spec.capacity, lastRefill: now };
      this.buckets.set(key, state);
    } else {
      // Lazy refill: top up by `elapsed * refillRate`, capped at capacity.
      // Doing the math on demand (vs. a per-bucket setInterval) keeps idle
      // users free.
      const elapsedSec = (now - state.lastRefill) / 1000;
      state.tokens = Math.min(spec.capacity, state.tokens + elapsedSec * spec.refillPerSec);
      state.lastRefill = now;
    }

    if (state.tokens >= 1) {
      state.tokens -= 1;
      return { allowed: true };
    }

    // Out of tokens. Tell the client roughly when they'll have one again
    // so they can back off cleanly instead of guessing.
    const tokensNeeded = 1 - state.tokens;
    const retryAfterMs = Math.ceil((tokensNeeded / spec.refillPerSec) * 1000);
    return { allowed: false, retryAfterMs };
  }

  /** Test-only: clear all buckets. Not part of the public RateLimiter contract. */
  reset(): void {
    this.buckets.clear();
  }
}

/**
 * Factory that mirrors `createBroadcaster`. Mode is driven by the same
 * `WS_MODE` env var so dev and prod stay in sync.
 *
 * In `apigw` mode the production implementation (DynamoDB-backed) lives
 * in `dynamo-limiter.ts` and is loaded dynamically to keep its AWS-SDK
 * imports out of the local-dev cold path.
 */
export async function createRateLimiter(mode: 'local' | 'apigw'): Promise<RateLimiter> {
  if (mode === 'apigw') {
    // Production DynamoDB-backed implementation lands in a follow-up
    // change. Until then, fall back to in-memory and log a warning so
    // staging deploys don't silently lose limiting.
    console.warn('[ws/limiter] apigw mode requested; DynamoDbRateLimiter not yet available, using in-memory');
  }
  return new InMemoryRateLimiter();
}
