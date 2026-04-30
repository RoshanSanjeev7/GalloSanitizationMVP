/**
 * Tests for the in-memory token-bucket rate limiter.
 *
 * The limiter is the gate that decides whether each WebSocket frame is
 * allowed through, so getting its math right matters a lot — under-
 * limiting lets attackers through, over-limiting frustrates real users.
 *
 * Strategy:
 *   - Use vitest fake timers + `vi.advanceTimersByTime` to control the
 *     refill clock deterministically. Real timers would make the refill
 *     fraction non-reproducible.
 *   - Cover bucket exhaustion, refill behavior, the per-(user, type)
 *     keying contract, retryAfterMs accuracy, and the "unknown
 *     message type → unlimited" defensive default.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryRateLimiter } from '../limiter.js';

describe('InMemoryRateLimiter', () => {
  let limiter: InMemoryRateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T00:00:00Z'));
    limiter = new InMemoryRateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic bucket behavior', () => {
    it('allows the first request for a fresh key', async () => {
      const r = await limiter.checkAndConsume('user-1', 'machine_change');
      expect(r.allowed).toBe(true);
    });

    it('allows up to capacity in immediate burst (machine_change cap=20)', async () => {
      const allowed: boolean[] = [];
      for (let i = 0; i < 20; i++) {
        const r = await limiter.checkAndConsume('user-1', 'machine_change');
        allowed.push(r.allowed);
      }
      expect(allowed.every((a) => a === true)).toBe(true);
    });

    it('rejects the 21st request in immediate burst', async () => {
      for (let i = 0; i < 20; i++) {
        await limiter.checkAndConsume('user-1', 'machine_change');
      }
      const r = await limiter.checkAndConsume('user-1', 'machine_change');
      expect(r.allowed).toBe(false);
      expect(r.retryAfterMs).toBeGreaterThan(0);
    });

    it('returns retryAfterMs that approximates the refill time', async () => {
      // Drain bucket. machine_change refills 5 tokens/sec → next token
      // becomes available in roughly 200ms.
      for (let i = 0; i < 20; i++) {
        await limiter.checkAndConsume('user-1', 'machine_change');
      }
      const r = await limiter.checkAndConsume('user-1', 'machine_change');
      expect(r.allowed).toBe(false);
      // Allow ±50ms slack for ceiling rounding in the Math.ceil call.
      expect(r.retryAfterMs).toBeGreaterThanOrEqual(150);
      expect(r.retryAfterMs).toBeLessThanOrEqual(250);
    });
  });

  describe('refill', () => {
    it('refills tokens at the spec rate over time', async () => {
      // Drain bucket completely.
      for (let i = 0; i < 20; i++) {
        await limiter.checkAndConsume('user-1', 'machine_change');
      }
      // Spec is 5/sec → 1 second of refill = 5 tokens.
      vi.advanceTimersByTime(1000);
      // Now we should be able to consume exactly 5 more.
      const allowed: boolean[] = [];
      for (let i = 0; i < 5; i++) {
        const r = await limiter.checkAndConsume('user-1', 'machine_change');
        allowed.push(r.allowed);
      }
      const r6 = await limiter.checkAndConsume('user-1', 'machine_change');
      expect(allowed.every((a) => a === true)).toBe(true);
      expect(r6.allowed).toBe(false);
    });

    it('caps refill at bucket capacity (idle bucket does not over-fill)', async () => {
      // Use one token, then go idle for an hour. The bucket should refill
      // to capacity (20), not to capacity + 18000.
      await limiter.checkAndConsume('user-1', 'machine_change');
      vi.advanceTimersByTime(60 * 60 * 1000);
      // We can take at most `capacity` (20) before the next over-limit.
      let allowedCount = 0;
      for (let i = 0; i < 25; i++) {
        const r = await limiter.checkAndConsume('user-1', 'machine_change');
        if (r.allowed) allowedCount++;
      }
      expect(allowedCount).toBe(20);
    });
  });

  describe('per-(user, type) keying', () => {
    it('does not share a bucket between users', async () => {
      // Drain user-1's bucket.
      for (let i = 0; i < 20; i++) {
        await limiter.checkAndConsume('user-1', 'machine_change');
      }
      // user-2 has its own untouched bucket and should be allowed.
      const r = await limiter.checkAndConsume('user-2', 'machine_change');
      expect(r.allowed).toBe(true);
    });

    it('does not share a bucket between message types', async () => {
      // Drain machine_change for user-1.
      for (let i = 0; i < 20; i++) {
        await limiter.checkAndConsume('user-1', 'machine_change');
      }
      // subscribe has its own bucket for the same user.
      const r = await limiter.checkAndConsume('user-1', 'subscribe');
      expect(r.allowed).toBe(true);
    });
  });

  describe('per-message-type spec coverage', () => {
    it('heartbeat has tight 2-token capacity', async () => {
      const r1 = await limiter.checkAndConsume('user-1', 'heartbeat');
      const r2 = await limiter.checkAndConsume('user-1', 'heartbeat');
      const r3 = await limiter.checkAndConsume('user-1', 'heartbeat');
      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(false);
    });

    it('subscribe allows 30-token burst', async () => {
      let allowedCount = 0;
      for (let i = 0; i < 30; i++) {
        const r = await limiter.checkAndConsume('user-1', 'subscribe');
        if (r.allowed) allowedCount++;
      }
      const r31 = await limiter.checkAndConsume('user-1', 'subscribe');
      expect(allowedCount).toBe(30);
      expect(r31.allowed).toBe(false);
    });
  });

  describe('defensive defaults', () => {
    it('allows messages with no spec (unknown type) without limiting', async () => {
      // Defensive default: a message type without a bucket spec is
      // allowed unconditionally rather than locked out by a missing-spec
      // error. New types added to messages.ts shouldn't accidentally
      // break the whole feature.
      for (let i = 0; i < 100; i++) {
        const r = await limiter.checkAndConsume('user-1', 'definitely_not_a_real_type');
        expect(r.allowed).toBe(true);
      }
    });
  });

  describe('reset', () => {
    it('clears all buckets', async () => {
      // Drain a bucket.
      for (let i = 0; i < 20; i++) {
        await limiter.checkAndConsume('user-1', 'machine_change');
      }
      const before = await limiter.checkAndConsume('user-1', 'machine_change');
      expect(before.allowed).toBe(false);

      limiter.reset();

      const after = await limiter.checkAndConsume('user-1', 'machine_change');
      expect(after.allowed).toBe(true);
    });
  });
});
