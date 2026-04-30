/**
 * Zod schemas for inbound WebSocket frames.
 *
 * The `ClientMessage` types in `messages.ts` describe what the backend
 * EXPECTS to receive — but TypeScript types vanish at runtime, so without
 * a schema check a hostile (or buggy) client can send arbitrary JSON and
 * the server would happily process it. This module is the runtime
 * contract: every inbound message must `safeParse` successfully against
 * one of these schemas before it reaches the routing switch in
 * `LocalWsBroadcaster.handleMessage`.
 *
 * Discriminated union via `z.discriminatedUnion('type', [...])` mirrors
 * the TS discriminated union exactly, so the parsed value is fully typed
 * with no extra cast needed.
 */

import { z } from 'zod';

const subscribeSchema = z.object({
  type: z.literal('subscribe'),
  checklistId: z.string().min(1).max(128),
});

const unsubscribeSchema = z.object({
  type: z.literal('unsubscribe'),
  checklistId: z.string().min(1).max(128),
});

const machineChangeSchema = z.object({
  type: z.literal('machine_change'),
  checklistId: z.string().min(1).max(128),
  // Cap absurdly large indexes to keep DynamoDB writes bounded.
  // No real checklist has 1000+ machines.
  machineIdx: z.number().int().nonnegative().max(999),
});

const subscribeDashboardSchema = z.object({
  type: z.literal('subscribe_dashboard'),
});

const unsubscribeDashboardSchema = z.object({
  type: z.literal('unsubscribe_dashboard'),
});

const heartbeatSchema = z.object({
  type: z.literal('heartbeat'),
});

const idleSchema = z.object({
  type: z.literal('idle'),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  subscribeSchema,
  unsubscribeSchema,
  machineChangeSchema,
  subscribeDashboardSchema,
  unsubscribeDashboardSchema,
  heartbeatSchema,
  idleSchema,
]);

export type ValidatedClientMessage = z.infer<typeof clientMessageSchema>;

export interface ValidationFailure {
  ok: false;
  code:
    | 'INVALID_JSON'        // raw payload wasn't even JSON
    | 'INVALID_PAYLOAD'     // JSON but didn't match any known message shape
    | 'UNKNOWN_TYPE';       // discriminator not in the union (subset of INVALID_PAYLOAD,
                            // surfaced separately so the client can diagnose typos)
  reason: string;
}

export interface ValidationSuccess {
  ok: true;
  msg: ValidatedClientMessage;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Parse a raw WebSocket frame as a known client message.
 * Returns a tagged union so callers don't have to throw/catch.
 */
export function validateClientMessage(raw: unknown): ValidationResult {
  let parsed: unknown;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, code: 'INVALID_JSON', reason: 'payload is not valid JSON' };
    }
  } else if (raw instanceof Buffer) {
    try {
      parsed = JSON.parse(raw.toString('utf8'));
    } catch {
      return { ok: false, code: 'INVALID_JSON', reason: 'payload is not valid JSON' };
    }
  } else {
    parsed = raw;
  }

  // Detect bad/missing discriminator early so the client gets a clearer
  // error message than Zod's generic "no matching union variant".
  if (parsed === null || typeof parsed !== 'object') {
    return { ok: false, code: 'INVALID_PAYLOAD', reason: 'payload is not an object' };
  }
  const t = (parsed as { type?: unknown }).type;
  if (typeof t !== 'string') {
    return { ok: false, code: 'INVALID_PAYLOAD', reason: 'missing or non-string `type` field' };
  }

  const result = clientMessageSchema.safeParse(parsed);
  if (!result.success) {
    const known = ['subscribe', 'unsubscribe', 'machine_change', 'subscribe_dashboard', 'unsubscribe_dashboard', 'heartbeat', 'idle'];
    if (!known.includes(t)) {
      return { ok: false, code: 'UNKNOWN_TYPE', reason: `unknown message type "${t}"` };
    }
    // Flatten Zod's issue list into a single human-readable line; clients
    // mostly need to know "this field is wrong" rather than the full tree.
    const firstIssue = result.error.issues[0];
    const path = firstIssue?.path.join('.') || '(root)';
    return {
      ok: false,
      code: 'INVALID_PAYLOAD',
      reason: `${path}: ${firstIssue?.message ?? 'invalid'}`,
    };
  }

  return { ok: true, msg: result.data };
}
