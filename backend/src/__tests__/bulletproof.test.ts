import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── Mock modules BEFORE importing app ────────────────────────────────

vi.mock('../data/seed-dynamo.js', () => ({
  seedIfEmpty: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../data/dynamo.js', () => ({
  queryChecklists: vi.fn().mockResolvedValue([]),
  getChecklist: vi.fn().mockResolvedValue(undefined),
  putChecklist: vi.fn().mockResolvedValue(undefined),
  conditionalPutChecklist: vi.fn().mockResolvedValue(undefined),
  conditionalStatusTransition: vi.fn().mockResolvedValue(undefined),
  conditionalDeleteChecklist: vi.fn().mockResolvedValue(undefined),
  markChecklistViewed: vi.fn().mockResolvedValue(undefined),
  updateChecklistMachine: vi.fn().mockResolvedValue(undefined),
  deleteChecklist: vi.fn().mockResolvedValue(undefined),
  getLine: vi.fn().mockResolvedValue(undefined),
  getUser: vi.fn().mockResolvedValue(undefined),
  getTemplatesByLineId: vi.fn().mockResolvedValue([]),
  getAllTemplates: vi.fn().mockResolvedValue([]),
  getUserByEmail: vi.fn().mockResolvedValue(undefined),
  getAllUsers: vi.fn().mockResolvedValue([]),
  putUser: vi.fn().mockResolvedValue(undefined),
  createUserWithEmailLock: vi.fn().mockResolvedValue(undefined),
  deleteUserWithEmailLock: vi.fn().mockResolvedValue(undefined),
  deleteUser: vi.fn().mockResolvedValue(undefined),
  getAllLines: vi.fn().mockResolvedValue([]),
  putLine: vi.fn().mockResolvedValue(undefined),
  getTemplate: vi.fn().mockResolvedValue(undefined),
  putTemplate: vi.fn().mockResolvedValue(undefined),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),
  getAllChecklists: vi.fn().mockResolvedValue([]),
  getChecklistsByOperator: vi.fn().mockResolvedValue([]),
  getChecklistsByStatus: vi.fn().mockResolvedValue([]),
  appendChecklistImages: vi.fn().mockResolvedValue(undefined),
  removeChecklistImage: vi.fn().mockResolvedValue(undefined),
  docClient: {},
}));

vi.mock('../data/sqs.js', () => ({
  sendPdfGenerationMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../data/s3.js', () => ({
  uploadImage: vi.fn().mockResolvedValue('https://s3.example.com/image.jpg'),
  getSignedImageUrl: vi.fn().mockResolvedValue('https://s3.example.com/signed.jpg'),
  getImageUrl: vi.fn().mockResolvedValue('https://s3.example.com/signed.jpg'),
  getImageUrls: vi.fn().mockResolvedValue({}),
  deleteImage: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports AFTER mocks ──────────────────────────────────────────────

import { app } from '../index.js';
import {
  queryChecklists,
  getChecklist,
  conditionalPutChecklist,
  conditionalStatusTransition,
  conditionalDeleteChecklist,
  getUser,
  getAllUsers,
} from '../data/dynamo.js';
import {
  makeChecklist,
  makeSubmittedChecklist,
  makeUser,
  makeAdminToken,
  makeOperatorToken,
} from './factories.js';

const mockedQueryChecklists = vi.mocked(queryChecklists);
const mockedGetChecklist = vi.mocked(getChecklist);
const mockedConditionalPutChecklist = vi.mocked(conditionalPutChecklist);
const mockedConditionalStatusTransition = vi.mocked(conditionalStatusTransition);
const mockedConditionalDeleteChecklist = vi.mocked(conditionalDeleteChecklist);
const mockedGetUser = vi.mocked(getUser);
const mockedGetAllUsers = vi.mocked(getAllUsers);

// ── Helpers ──────────────────────────────────────────────────────────

function makeConditionalCheckFailedError(): Error {
  const err = new Error('The conditional request failed');
  err.name = 'ConditionalCheckFailedException';
  return err;
}

// ─────────────────────────────────────────────────────────────────────
// BULLETPROOF TESTS
// ─────────────────────────────────────────────────────────────────────

describe('Bulletproofing', () => {
  const adminToken = makeAdminToken('admin-1');
  const operatorToken = makeOperatorToken('operator-1');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ════════════════════════════════════════════════════════════════════
  // 1. CONCURRENCY TESTS
  // ════════════════════════════════════════════════════════════════════
  describe('Concurrency', () => {
    describe('double approve', () => {
      it('first approve returns 200, second returns 409', async () => {
        // Each request gets its own checklist object to avoid shared mutation
        const checklist1 = makeSubmittedChecklist({ id: 'cl-double-approve' });
        const checklist2 = makeSubmittedChecklist({ id: 'cl-double-approve' });

        mockedGetChecklist
          .mockResolvedValueOnce(checklist1)
          .mockResolvedValueOnce(checklist2);

        // First transition succeeds, second fails with conditional check
        mockedConditionalStatusTransition
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(makeConditionalCheckFailedError());

        const res1 = await request(app)
          .post('/api/checklists/cl-double-approve/approve')
          .set('Authorization', `Bearer ${adminToken}`);

        const res2 = await request(app)
          .post('/api/checklists/cl-double-approve/approve')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res1.status).toBe(200);
        expect(res2.status).toBe(409);
        expect(res2.body.error).toMatch(/already been reviewed/i);
      });
    });

    describe('approve non-submitted checklist', () => {
      it('returns 400 when checklist is in_progress', async () => {
        const checklist = makeChecklist({
          id: 'cl-in-progress',
          status: 'in_progress',
        });
        mockedGetChecklist.mockResolvedValueOnce(checklist);

        const res = await request(app)
          .post('/api/checklists/cl-in-progress/approve')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Only submitted checklists can be approved');
      });
    });

    describe('submit non-in_progress checklist', () => {
      it('returns 400 when checklist is already submitted', async () => {
        const checklist = makeSubmittedChecklist({ id: 'cl-already-submitted' });
        mockedGetChecklist.mockResolvedValueOnce(checklist);

        const res = await request(app)
          .post('/api/checklists/cl-already-submitted/submit')
          .set('Authorization', `Bearer ${operatorToken}`);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Only in-progress checklists can be submitted');
      });
    });

    describe('version conflict on items update', () => {
      it('returns 409 when version does not match', async () => {
        const checklist = makeChecklist({
          id: 'cl-version-conflict',
          status: 'in_progress',
          version: 3,
        });
        mockedGetChecklist.mockResolvedValueOnce(checklist);

        const res = await request(app)
          .put('/api/checklists/cl-version-conflict/items')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            machines: checklist.machines,
            version: 2,
          });

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/modified by another user/i);
      });
    });

    describe('delete already-deleted checklist', () => {
      it('returns 404 when conditional delete fails', async () => {
        mockedConditionalDeleteChecklist.mockRejectedValueOnce(
          makeConditionalCheckFailedError(),
        );

        const res = await request(app)
          .delete('/api/checklists/cl-already-deleted')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Checklist not found');
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 2. ADMIN SAFETY TESTS
  // ════════════════════════════════════════════════════════════════════
  describe('Admin Safety', () => {
    describe('self-delete blocked', () => {
      it('returns 400 when admin tries to delete themselves', async () => {
        const res = await request(app)
          .delete('/api/users/admin-1')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/cannot delete your own account/i);
      });
    });

    describe('last admin delete blocked', () => {
      it('returns 400 when trying to delete the last admin', async () => {
        const lastAdmin = makeUser({
          id: 'admin-target',
          role: 'admin',
          email: 'lastadmin@test.com',
        });
        mockedGetUser.mockResolvedValueOnce(lastAdmin);
        mockedGetAllUsers.mockResolvedValueOnce([lastAdmin]);

        const res = await request(app)
          .delete('/api/users/admin-target')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/cannot delete the last admin/i);
      });
    });

    describe('last admin demote blocked', () => {
      it('returns 400 when trying to demote the last admin to operator', async () => {
        const lastAdmin = makeUser({
          id: 'admin-demote',
          role: 'admin',
          email: 'onlyadmin@test.com',
        });
        mockedGetUser.mockResolvedValueOnce(lastAdmin);
        mockedGetAllUsers.mockResolvedValueOnce([lastAdmin]);

        const res = await request(app)
          .put('/api/users/admin-demote')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'operator' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/cannot demote the last admin/i);
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 3. RATE LIMITING / PAGINATION CAP TESTS
  // ════════════════════════════════════════════════════════════════════
  describe('Pagination Cap', () => {
    it('caps limit at 100 even when client requests more', async () => {
      // Create 150 checklists
      const checklists = Array.from({ length: 150 }, (_, i) =>
        makeChecklist({
          startTime: `2024-01-${String(i + 1).padStart(3, '0')}T00:00:00.000Z`,
        }),
      );
      mockedQueryChecklists.mockResolvedValueOnce(checklists);

      const res = await request(app)
        .get('/api/checklists?limit=999999')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      // The handler caps limit at 100, so at most 100 items should be returned
      expect(res.body.items.length).toBeLessThanOrEqual(100);
      expect(res.body.total).toBe(150);
      expect(res.body.hasMore).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 4. INPUT VALIDATION TESTS
  // ════════════════════════════════════════════════════════════════════
  describe('Input Validation', () => {
    describe('invalid machines structure', () => {
      it('returns 400 when items have non-boolean completed', async () => {
        const checklist = makeChecklist({
          id: 'cl-bad-machines',
          status: 'in_progress',
          version: 1,
        });
        mockedGetChecklist.mockResolvedValueOnce(checklist);

        const invalidMachines = [
          {
            name: 'Machine A',
            categories: [
              {
                name: 'Category 1',
                items: [
                  {
                    description: 'Task 1',
                    completed: 'yes',  // invalid: should be boolean or null
                    issue: null,
                    images: [],
                  },
                ],
              },
            ],
          },
        ];

        const res = await request(app)
          .put('/api/checklists/cl-bad-machines/items')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({ machines: invalidMachines, version: 1 });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/invalid machines structure/i);
      });
    });

    describe('image key ownership', () => {
      it('returns 403 when keys do not start with checklist ID', async () => {
        const res = await request(app)
          .post('/api/checklists/cl-mine/image-urls')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            keys: ['other-checklist/0-0-0/photo.png', 'cl-mine/0-0-0/legit.png'],
          });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/access denied/i);
      });
    });
  });
});
