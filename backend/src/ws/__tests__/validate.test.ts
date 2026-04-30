/**
 * Tests for the WebSocket inbound message validator.
 *
 * Coverage strategy: every legal `ClientMessage` discriminator gets at
 * least one valid-payload acceptance test and one invalid-payload
 * rejection test. Edge cases (non-JSON, non-object, missing
 * discriminator, unknown discriminator, wrong field types, out-of-range
 * values) get their own dedicated cases so a regression in any of
 * those branches surfaces immediately.
 */

import { describe, it, expect } from 'vitest';
import { validateClientMessage } from '../validate.js';

describe('validateClientMessage', () => {
  describe('valid payloads — accepts every legal discriminator', () => {
    const cases: Array<[string, object]> = [
      ['subscribe', { type: 'subscribe', checklistId: 'cl-1' }],
      ['unsubscribe', { type: 'unsubscribe', checklistId: 'cl-1' }],
      ['machine_change', { type: 'machine_change', checklistId: 'cl-1', machineIdx: 0 }],
      ['machine_change with high index', { type: 'machine_change', checklistId: 'cl-1', machineIdx: 42 }],
      ['subscribe_dashboard', { type: 'subscribe_dashboard' }],
      ['unsubscribe_dashboard', { type: 'unsubscribe_dashboard' }],
      ['heartbeat', { type: 'heartbeat' }],
      ['idle', { type: 'idle' }],
    ];

    it.each(cases)('accepts %s', (_label, msg) => {
      const result = validateClientMessage(JSON.stringify(msg));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.msg).toEqual(msg);
      }
    });
  });

  describe('input shape — handles strings, buffers, and pre-parsed objects', () => {
    it('parses a JSON string', () => {
      const r = validateClientMessage('{"type":"heartbeat"}');
      expect(r.ok).toBe(true);
    });

    it('parses a Buffer (what ws library passes by default)', () => {
      const r = validateClientMessage(Buffer.from('{"type":"heartbeat"}', 'utf8'));
      expect(r.ok).toBe(true);
    });

    it('accepts a pre-parsed object', () => {
      const r = validateClientMessage({ type: 'heartbeat' });
      expect(r.ok).toBe(true);
    });
  });

  describe('non-JSON / non-object payloads → INVALID_JSON or INVALID_PAYLOAD', () => {
    it('rejects a non-JSON string with INVALID_JSON', () => {
      const r = validateClientMessage('not json at all');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_JSON');
    });

    it('rejects a malformed JSON buffer with INVALID_JSON', () => {
      const r = validateClientMessage(Buffer.from('{not: valid}', 'utf8'));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_JSON');
    });

    it('rejects null payload with INVALID_PAYLOAD', () => {
      const r = validateClientMessage('null');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_PAYLOAD');
    });

    it('rejects a JSON array with INVALID_PAYLOAD', () => {
      const r = validateClientMessage('[1,2,3]');
      // Arrays are objects in JS — but they're missing `type` so they
      // fall into the "missing discriminator" branch.
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_PAYLOAD');
    });

    it('rejects a JSON number with INVALID_PAYLOAD', () => {
      const r = validateClientMessage('42');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_PAYLOAD');
    });
  });

  describe('discriminator handling', () => {
    it('rejects missing type with INVALID_PAYLOAD', () => {
      const r = validateClientMessage('{"checklistId":"cl-1"}');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_PAYLOAD');
    });

    it('rejects non-string type with INVALID_PAYLOAD', () => {
      const r = validateClientMessage('{"type":42}');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_PAYLOAD');
    });

    it('rejects unknown discriminator with UNKNOWN_TYPE', () => {
      const r = validateClientMessage('{"type":"definitely_not_a_real_message"}');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('UNKNOWN_TYPE');
    });
  });

  describe('field-level validation — invalid payloads on real types', () => {
    it('rejects subscribe missing checklistId', () => {
      const r = validateClientMessage('{"type":"subscribe"}');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_PAYLOAD');
    });

    it('rejects subscribe with empty checklistId', () => {
      const r = validateClientMessage('{"type":"subscribe","checklistId":""}');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_PAYLOAD');
    });

    it('rejects subscribe with absurdly long checklistId (DoS guard)', () => {
      const longId = 'x'.repeat(200);
      const r = validateClientMessage(JSON.stringify({ type: 'subscribe', checklistId: longId }));
      expect(r.ok).toBe(false);
    });

    it('rejects machine_change with negative index', () => {
      const r = validateClientMessage(JSON.stringify({
        type: 'machine_change',
        checklistId: 'cl-1',
        machineIdx: -1,
      }));
      expect(r.ok).toBe(false);
    });

    it('rejects machine_change with absurdly large index', () => {
      const r = validateClientMessage(JSON.stringify({
        type: 'machine_change',
        checklistId: 'cl-1',
        machineIdx: 99999,
      }));
      expect(r.ok).toBe(false);
    });

    it('rejects machine_change with non-integer index', () => {
      const r = validateClientMessage(JSON.stringify({
        type: 'machine_change',
        checklistId: 'cl-1',
        machineIdx: 1.5,
      }));
      expect(r.ok).toBe(false);
    });

    it('rejects machine_change with string index', () => {
      const r = validateClientMessage(JSON.stringify({
        type: 'machine_change',
        checklistId: 'cl-1',
        machineIdx: '0',
      }));
      expect(r.ok).toBe(false);
    });
  });

  describe('reason field is human-readable', () => {
    it('includes the field path on field-level failures', () => {
      const r = validateClientMessage(JSON.stringify({
        type: 'machine_change',
        checklistId: 'cl-1',
        machineIdx: -5,
      }));
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toContain('machineIdx');
      }
    });

    it('includes the unknown type name on UNKNOWN_TYPE', () => {
      const r = validateClientMessage('{"type":"frobnicate"}');
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toContain('frobnicate');
      }
    });
  });
});
