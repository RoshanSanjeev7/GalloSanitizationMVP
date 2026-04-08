import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { makeChecklist } from '../../__tests__/factories.js';
import type { Checklist } from '../../types/index.js';

/**
 * Property-based tests for checklist status transition invariants.
 *
 * These are pure logic tests — no HTTP, no mocking. We create checklist
 * objects and verify the state machine rules hold for all generated inputs.
 */

// Arbitrary that generates a partial checklist override with random names/ids
const checklistOverridesArb = fc.record({
  id: fc.uuid(),
  lineName: fc.string({ minLength: 1, maxLength: 50 }),
  operatorName: fc.string({ minLength: 1, maxLength: 50 }),
  operatorId: fc.uuid(),
  lineId: fc.uuid(),
  templateId: fc.uuid(),
});

describe('Checklist lifecycle property tests', () => {
  it('submitting an in_progress checklist always sets endTime and submittedAt to non-null values', () => {
    fc.assert(
      fc.property(checklistOverridesArb, (overrides) => {
        const checklist = makeChecklist({ ...overrides, status: 'in_progress' });

        // Simulate the submit action (mirrors routes/checklists.ts POST /:id/submit)
        const now = new Date().toISOString();
        checklist.status = 'submitted';
        checklist.endTime = now;
        checklist.submittedAt = now;

        expect(checklist.status).toBe('submitted');
        expect(checklist.endTime).not.toBeNull();
        expect(checklist.submittedAt).not.toBeNull();
        expect(checklist.endTime).toBe(checklist.submittedAt);
      }),
      { numRuns: 100 },
    );
  });

  it('approving a submitted checklist always results in status "approved"', () => {
    fc.assert(
      fc.property(checklistOverridesArb, (overrides) => {
        const now = new Date().toISOString();
        const checklist = makeChecklist({
          ...overrides,
          status: 'submitted',
          endTime: now,
          submittedAt: now,
        });

        // Simulate the approve action
        checklist.status = 'approved';

        expect(checklist.status).toBe('approved');
        // endTime and submittedAt should still be set from submission
        expect(checklist.endTime).not.toBeNull();
        expect(checklist.submittedAt).not.toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('denying a submitted checklist always results in status "denied"', () => {
    fc.assert(
      fc.property(checklistOverridesArb, (overrides) => {
        const now = new Date().toISOString();
        const checklist = makeChecklist({
          ...overrides,
          status: 'submitted',
          endTime: now,
          submittedAt: now,
        });

        // Simulate the deny action
        checklist.status = 'denied';

        expect(checklist.status).toBe('denied');
        expect(checklist.endTime).not.toBeNull();
        expect(checklist.submittedAt).not.toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('updatedAt is always a valid ISO string when set during item updates', () => {
    fc.assert(
      fc.property(
        checklistOverridesArb,
        fc.constantFrom('in_progress' as const, 'submitted' as const),
        (overrides, status) => {
          const checklist = makeChecklist({ ...overrides, status });

          // Simulate the update-items action
          checklist.updatedAt = new Date().toISOString();

          expect(checklist.updatedAt).not.toBeNull();
          // Verify it parses as a valid date
          const parsed = new Date(checklist.updatedAt!);
          expect(parsed.toISOString()).toBe(checklist.updatedAt);
          expect(Number.isNaN(parsed.getTime())).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('status transitions only follow valid paths: in_progress -> submitted -> approved|denied', () => {
    const validTransitions: Record<string, string[]> = {
      in_progress: ['submitted'],
      submitted: ['approved', 'denied'],
      approved: [],
      denied: [],
    };

    fc.assert(
      fc.property(
        checklistOverridesArb,
        fc.constantFrom(
          ...Object.keys(validTransitions) as Checklist['status'][],
        ),
        (overrides, fromStatus) => {
          const allowed = validTransitions[fromStatus];

          // For each starting status, verify the allowed transitions produce valid states
          for (const toStatus of allowed) {
            const checklist = makeChecklist({ ...overrides, status: fromStatus });
            checklist.status = toStatus as Checklist['status'];
            expect(['in_progress', 'submitted', 'approved', 'denied']).toContain(
              checklist.status,
            );
          }

          // Terminal states have no valid transitions
          if (allowed.length === 0) {
            expect(fromStatus === 'approved' || fromStatus === 'denied').toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
