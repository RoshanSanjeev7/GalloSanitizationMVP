import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property-based tests for URL construction / URLSearchParams behavior.
 *
 * The frontend getChecklists function builds URLs via:
 *   const query = new URLSearchParams(params).toString();
 *   const endpoint = query ? `/checklists?${query}` : '/checklists';
 *
 * These tests verify URLSearchParams invariants hold for arbitrary inputs.
 */

describe('API URL construction property tests', () => {
  it('URLSearchParams always produces a parseable query string for any string key-value pairs', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.string({ minLength: 0, maxLength: 100 }),
          { minKeys: 1, maxKeys: 10 },
        ),
        (params) => {
          const qs = new URLSearchParams(params).toString();

          // The result should be a string
          expect(typeof qs).toBe('string');

          // Round-trip: parsing the query string back should recover all keys
          const parsed = new URLSearchParams(qs);
          for (const [key, value] of Object.entries(params)) {
            expect(parsed.get(key)).toBe(value);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('empty params produce an empty query string', () => {
    fc.assert(
      fc.property(fc.constant({}), (params) => {
        const qs = new URLSearchParams(params).toString();
        expect(qs).toBe('');
      }),
    );
  });

  it('special characters are properly encoded and decodable', () => {
    // Characters that need URL encoding: spaces, &, =, ?, #, /, +, unicode
    const specialChars = [
      ' ', '&', '=', '?', '#', '/', '+', '%', '!', '@',
      '\u00e9', '\u00f1', '\u00fc', '\u4e16', '\u754c',
    ];
    const specialCharArb = fc
      .array(fc.constantFrom(...specialChars), { minLength: 1, maxLength: 20 })
      .map((chars) => chars.join(''));

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        specialCharArb,
        (key, value) => {
          const params = { [key]: value };
          const qs = new URLSearchParams(params).toString();

          // Should not contain raw special characters that break URLs
          // (spaces become +, & and = are encoded)
          const parsed = new URLSearchParams(qs);
          expect(parsed.get(key)).toBe(value);

          // The full endpoint construction should produce a valid string
          const endpoint = qs ? `/checklists?${qs}` : '/checklists';
          expect(endpoint.startsWith('/checklists')).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});
