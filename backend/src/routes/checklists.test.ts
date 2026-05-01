import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock seed-dynamo BEFORE importing app so the module-level seedIfEmpty() is a no-op
vi.mock('../data/seed-dynamo.js', () => ({
  seedIfEmpty: vi.fn().mockResolvedValue(undefined),
}));

// Mock all dynamo functions used by the checklists route
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
  // Other dynamo exports used by other routes that also get imported via app
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

// Mock S3 module used by the images route (also mounted under /api/checklists)
vi.mock('../data/s3.js', () => ({
  uploadImage: vi.fn().mockResolvedValue('https://s3.example.com/image.jpg'),
  getSignedImageUrl: vi.fn().mockResolvedValue('https://s3.example.com/signed.jpg'),
  getImageUrl: vi.fn().mockResolvedValue('https://s3.example.com/signed.jpg'),
}));

import { app } from '../index.js';
import {
  queryChecklists,
  getChecklist,
  putChecklist,
  conditionalPutChecklist,
  conditionalStatusTransition,
  conditionalDeleteChecklist,
  markChecklistViewed,
  updateChecklistMachine,
  deleteChecklist,
  getLine,
  getUser,
  getTemplatesByLineId,
  getAllTemplates,
} from '../data/dynamo.js';
import {
  makeChecklist,
  makeSubmittedChecklist,
  makeUser,
  makeLine,
  makeTemplate,
  makeAdminToken,
  makeOperatorToken,
} from '../__tests__/factories.js';

const mockedQueryChecklists = vi.mocked(queryChecklists);
const mockedGetChecklist = vi.mocked(getChecklist);
const mockedPutChecklist = vi.mocked(putChecklist);
const mockedConditionalPutChecklist = vi.mocked(conditionalPutChecklist);
const mockedConditionalStatusTransition = vi.mocked(conditionalStatusTransition);
const mockedConditionalDeleteChecklist = vi.mocked(conditionalDeleteChecklist);
const mockedMarkChecklistViewed = vi.mocked(markChecklistViewed);
const mockedUpdateChecklistMachine = vi.mocked(updateChecklistMachine);
const mockedDeleteChecklist = vi.mocked(deleteChecklist);
const mockedGetLine = vi.mocked(getLine);
const mockedGetUser = vi.mocked(getUser);
const mockedGetTemplatesByLineId = vi.mocked(getTemplatesByLineId);
const mockedGetAllTemplates = vi.mocked(getAllTemplates);

describe('Checklists Routes', () => {
  const adminToken = makeAdminToken('admin-1');
  const operatorToken = makeOperatorToken('operator-1');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────
  // AUTH — all routes require a Bearer token
  // ────────────────────────────────────────────────────────────────
  describe('authentication', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).get('/api/checklists');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });

    it('returns 401 for an invalid token', async () => {
      const res = await request(app)
        .get('/api/checklists')
        .set('Authorization', 'Bearer bad-token');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid token');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /api/checklists
  // ────────────────────────────────────────────────────────────────
  describe('GET /api/checklists', () => {
    it('returns all checklists sorted by startTime descending', async () => {
      const older = makeChecklist({ startTime: '2024-01-01T00:00:00.000Z' });
      const newer = makeChecklist({ startTime: '2024-06-01T00:00:00.000Z' });
      mockedQueryChecklists.mockResolvedValueOnce([older, newer]);

      const res = await request(app)
        .get('/api/checklists')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      // Newer first
      expect(res.body.items[0].id).toBe(newer.id);
      expect(res.body.items[1].id).toBe(older.id);
    });

    it('passes status query param to queryChecklists', async () => {
      mockedQueryChecklists.mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/checklists?status=submitted')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(mockedQueryChecklists).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'submitted' }),
      );
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('hasMore');
    });

    it('passes operatorId and lineId query params', async () => {
      mockedQueryChecklists.mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/checklists?operatorId=op-1&lineId=line-1')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(mockedQueryChecklists).toHaveBeenCalledWith(
        expect.objectContaining({ operatorId: 'op-1', lineId: 'line-1' }),
      );
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('hasMore');
    });

    it('returns paginated response with default limit of 50', async () => {
      // Create 3 checklists — well under default limit of 50
      const checklists = Array.from({ length: 3 }, (_, i) =>
        makeChecklist({ startTime: `2024-0${i + 1}-01T00:00:00.000Z` }),
      );
      mockedQueryChecklists.mockResolvedValueOnce(checklists);

      const res = await request(app)
        .get('/api/checklists')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(3);
      expect(res.body.total).toBe(3);
      expect(res.body.hasMore).toBe(false);
    });

    it('respects custom limit parameter', async () => {
      const checklists = Array.from({ length: 5 }, (_, i) =>
        makeChecklist({ startTime: `2024-0${i + 1}-01T00:00:00.000Z` }),
      );
      mockedQueryChecklists.mockResolvedValueOnce(checklists);

      const res = await request(app)
        .get('/api/checklists?limit=2')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(5);
    });

    it('respects offset parameter', async () => {
      const checklists = Array.from({ length: 5 }, (_, i) =>
        makeChecklist({
          startTime: `2024-0${5 - i}-01T00:00:00.000Z`,
          operatorName: `Operator ${i}`,
        }),
      );
      mockedQueryChecklists.mockResolvedValueOnce(checklists);

      const res = await request(app)
        .get('/api/checklists?limit=2&offset=2')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(5);
      // Items should be from positions 2 and 3 (0-indexed) after sorting
    });

    it('returns hasMore=true when more items exist', async () => {
      const checklists = Array.from({ length: 5 }, (_, i) =>
        makeChecklist({ startTime: `2024-0${i + 1}-01T00:00:00.000Z` }),
      );
      mockedQueryChecklists.mockResolvedValueOnce(checklists);

      const res = await request(app)
        .get('/api/checklists?limit=3&offset=0')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(3);
      expect(res.body.hasMore).toBe(true);
    });

    it('returns hasMore=false when no more items', async () => {
      const checklists = Array.from({ length: 5 }, (_, i) =>
        makeChecklist({ startTime: `2024-0${i + 1}-01T00:00:00.000Z` }),
      );
      mockedQueryChecklists.mockResolvedValueOnce(checklists);

      const res = await request(app)
        .get('/api/checklists?limit=3&offset=3')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.hasMore).toBe(false);
    });

    it('filters by search query (matches operatorName, case-insensitive)', async () => {
      const cl1 = makeChecklist({ operatorName: 'Alice Johnson', startTime: '2024-01-01T00:00:00.000Z' });
      const cl2 = makeChecklist({ operatorName: 'Bob Smith', startTime: '2024-02-01T00:00:00.000Z' });
      const cl3 = makeChecklist({ operatorName: 'alice walker', startTime: '2024-03-01T00:00:00.000Z' });
      mockedQueryChecklists.mockResolvedValueOnce([cl1, cl2, cl3]);

      const res = await request(app)
        .get('/api/checklists?search=alice')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.items.every((c: any) =>
        c.operatorName.toLowerCase().includes('alice'),
      )).toBe(true);
    });

    it('filters by search query (matches lineName, case-insensitive)', async () => {
      const cl1 = makeChecklist({ lineName: 'Line 91', startTime: '2024-01-01T00:00:00.000Z' });
      const cl2 = makeChecklist({ lineName: 'Line 92', startTime: '2024-02-01T00:00:00.000Z' });
      const cl3 = makeChecklist({ lineName: 'LINE 91 Extended', startTime: '2024-03-01T00:00:00.000Z' });
      mockedQueryChecklists.mockResolvedValueOnce([cl1, cl2, cl3]);

      const res = await request(app)
        .get('/api/checklists?search=line 91')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.items.every((c: any) =>
        c.lineName.toLowerCase().includes('line 91'),
      )).toBe(true);
    });

    it('handles comma-separated status values', async () => {
      const approved = makeChecklist({ status: 'approved', startTime: '2024-01-01T00:00:00.000Z' });
      const denied = makeChecklist({ status: 'denied', startTime: '2024-02-01T00:00:00.000Z' });
      // Mock two separate calls for each status
      mockedQueryChecklists
        .mockResolvedValueOnce([approved])
        .mockResolvedValueOnce([denied]);

      const res = await request(app)
        .get('/api/checklists?status=approved,denied')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(2);
      // Both statuses should be present
      const statuses = res.body.items.map((c: any) => c.status);
      expect(statuses).toContain('approved');
      expect(statuses).toContain('denied');
    });

    it('returns total count before pagination', async () => {
      const checklists = Array.from({ length: 10 }, (_, i) =>
        makeChecklist({ startTime: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
      );
      mockedQueryChecklists.mockResolvedValueOnce(checklists);

      const res = await request(app)
        .get('/api/checklists?limit=3&offset=0')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(3);
      expect(res.body.total).toBe(10);
      expect(res.body.hasMore).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /api/checklists/:id
  // ────────────────────────────────────────────────────────────────
  describe('GET /api/checklists/:id', () => {
    it('returns the checklist when it exists', async () => {
      const checklist = makeChecklist();
      mockedGetChecklist.mockResolvedValueOnce(checklist);

      const res = await request(app)
        .get(`/api/checklists/${checklist.id}`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(checklist.id);
    });

    it('returns 404 when checklist does not exist', async () => {
      mockedGetChecklist.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .get('/api/checklists/nonexistent')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Checklist not found');
    });

    it('marks submitted checklist as viewed when admin retrieves it', async () => {
      const checklist = makeSubmittedChecklist({ id: 'cl-view-1' });
      const adminUser = makeUser({ id: 'admin-1', name: 'Yolanda Martinez', role: 'admin' });
      mockedGetChecklist.mockResolvedValueOnce(checklist);
      mockedGetUser.mockResolvedValueOnce(adminUser);

      const res = await request(app)
        .get('/api/checklists/cl-view-1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.viewedAt).toBeTruthy();
      expect(res.body.viewedBy).toBe('Yolanda Martinez');
      expect(markChecklistViewed).toHaveBeenCalledWith(
        'cl-view-1',
        expect.any(String),
        'Yolanda Martinez',
      );
    });

    it('does NOT mark as viewed when operator retrieves it', async () => {
      const checklist = makeSubmittedChecklist({ id: 'cl-view-2' });
      mockedGetChecklist.mockResolvedValueOnce(checklist);

      const res = await request(app)
        .get('/api/checklists/cl-view-2')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.viewedAt).toBeUndefined();
      expect(markChecklistViewed).not.toHaveBeenCalled();
    });

    it('does NOT overwrite existing viewedAt (idempotent)', async () => {
      const checklist = makeSubmittedChecklist({
        id: 'cl-view-3',
        viewedAt: '2026-04-01T12:00:00.000Z',
        viewedBy: 'Previous Admin',
      });
      mockedGetChecklist.mockResolvedValueOnce(checklist);

      const res = await request(app)
        .get('/api/checklists/cl-view-3')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.viewedAt).toBe('2026-04-01T12:00:00.000Z');
      expect(res.body.viewedBy).toBe('Previous Admin');
      expect(markChecklistViewed).not.toHaveBeenCalled();
    });

    it('does NOT mark approved/denied checklists as viewed', async () => {
      const checklist = makeChecklist({ id: 'cl-view-4', status: 'approved' });
      mockedGetChecklist.mockResolvedValueOnce(checklist);

      const res = await request(app)
        .get('/api/checklists/cl-view-4')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.viewedAt).toBeUndefined();
      expect(markChecklistViewed).not.toHaveBeenCalled();
    });

    it('marks in_progress checklist as viewed when admin retrieves it', async () => {
      const checklist = makeChecklist({ id: 'cl-view-5', status: 'in_progress' });
      const adminUser = makeUser({ id: 'admin-1', name: 'Admin', role: 'admin' });
      mockedGetChecklist.mockResolvedValueOnce(checklist);
      mockedGetUser.mockResolvedValueOnce(adminUser);

      const res = await request(app)
        .get('/api/checklists/cl-view-5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.viewedAt).toBeTruthy();
      expect(markChecklistViewed).toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /api/checklists
  // ────────────────────────────────────────────────────────────────
  describe('POST /api/checklists', () => {
    it('creates a checklist from a line-specific template', async () => {
      const line = makeLine({ id: 'line-1', name: 'Line 91' });
      const user = makeUser({ id: 'operator-1', name: 'Test Op' });
      const template = makeTemplate({ lineId: 'line-1' });

      mockedGetLine.mockResolvedValueOnce(line);
      mockedGetUser.mockResolvedValueOnce(user);
      mockedGetTemplatesByLineId.mockResolvedValueOnce([template]);

      const res = await request(app)
        .post('/api/checklists')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ lineId: 'line-1' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('in_progress');
      expect(res.body.lineId).toBe('line-1');
      expect(res.body.lineName).toBe('Line 91');
      expect(res.body.operatorId).toBe('operator-1');
      expect(res.body.operatorName).toBe('Test Op');
      expect(res.body.templateId).toBe(template.id);
      expect(res.body.submittedAt).toBeNull();
      expect(res.body.updatedAt).toBeNull();
      expect(res.body.endTime).toBeNull();
      expect(res.body.version).toBe(1);
      expect(res.body.machines).toHaveLength(1);
      expect(putChecklist).toHaveBeenCalledOnce();
    });

    it('returns 400 when no template exists for the selected line', async () => {
      const line = makeLine({ id: 'line-2' });
      const user = makeUser({ id: 'operator-1' });

      mockedGetLine.mockResolvedValueOnce(line);
      mockedGetUser.mockResolvedValueOnce(user);
      mockedGetTemplatesByLineId.mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/api/checklists')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ lineId: 'line-2' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No published template available');
    });

    it('returns 404 when line does not exist', async () => {
      mockedGetLine.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/checklists')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ lineId: 'no-line' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Line not found');
    });

    it('returns 404 when user does not exist', async () => {
      mockedGetLine.mockResolvedValueOnce(makeLine());
      mockedGetUser.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/checklists')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ lineId: 'line-1' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });

    it('returns 400 when no template is available', async () => {
      mockedGetLine.mockResolvedValueOnce(makeLine());
      mockedGetUser.mockResolvedValueOnce(makeUser({ id: 'operator-1' }));
      mockedGetTemplatesByLineId.mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/api/checklists')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ lineId: 'line-1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No published template available');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // PUT /api/checklists/:id/items
  // ────────────────────────────────────────────────────────────────
  describe('PUT /api/checklists/:id/items', () => {
    it('updates machines on an in_progress checklist (operator)', async () => {
      const checklist = makeChecklist({ status: 'in_progress' });
      const operatorUser = makeUser({ id: 'operator-1', role: 'operator' });
      mockedGetChecklist.mockResolvedValueOnce(checklist);
      mockedGetUser.mockResolvedValueOnce(operatorUser);

      const newMachines = [{ name: 'Updated Machine', categories: [] }];
      const res = await request(app)
        .put(`/api/checklists/${checklist.id}/items`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ machines: newMachines });

      expect(res.status).toBe(200);
      expect(res.body.machines).toEqual(newMachines);
      expect(res.body.updatedAt).toBeTruthy();
      expect(conditionalPutChecklist).toHaveBeenCalledOnce();
    });

    it('allows admin to update a submitted checklist', async () => {
      const checklist = makeSubmittedChecklist();
      const adminUser = makeUser({ id: 'admin-1', role: 'admin' });
      mockedGetChecklist.mockResolvedValueOnce(checklist);
      mockedGetUser.mockResolvedValueOnce(adminUser);

      const newMachines = [{ name: 'Admin Edit', categories: [] }];
      const res = await request(app)
        .put(`/api/checklists/${checklist.id}/items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ machines: newMachines });

      expect(res.status).toBe(200);
      expect(res.body.machines).toEqual(newMachines);
    });

    it('returns 404 when checklist does not exist', async () => {
      mockedGetChecklist.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .put('/api/checklists/nonexistent/items')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ machines: [] });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Checklist not found');
    });

    it('returns 400 when operator tries to update a submitted checklist', async () => {
      const checklist = makeSubmittedChecklist();
      const operatorUser = makeUser({ id: 'operator-1', role: 'operator' });
      mockedGetChecklist.mockResolvedValueOnce(checklist);
      mockedGetUser.mockResolvedValueOnce(operatorUser);

      const res = await request(app)
        .put(`/api/checklists/${checklist.id}/items`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ machines: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot update items on this checklist');
    });

    it('returns 400 when checklist is approved', async () => {
      const checklist = makeChecklist({ status: 'approved' });
      const operatorUser = makeUser({ id: 'operator-1', role: 'operator' });
      mockedGetChecklist.mockResolvedValueOnce(checklist);
      mockedGetUser.mockResolvedValueOnce(operatorUser);

      const res = await request(app)
        .put(`/api/checklists/${checklist.id}/items`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ machines: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot update items on this checklist');
    });

    it('succeeds with matching version and increments it', async () => {
      const checklist = makeChecklist({ status: 'in_progress', version: 3 });
      const operatorUser = makeUser({ id: 'operator-1', role: 'operator' });
      mockedGetChecklist.mockResolvedValueOnce(checklist);
      mockedGetUser.mockResolvedValueOnce(operatorUser);

      const newMachines = [{ name: 'Updated', categories: [] }];
      const res = await request(app)
        .put(`/api/checklists/${checklist.id}/items`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ machines: newMachines, version: 3 });

      expect(res.status).toBe(200);
      expect(res.body.version).toBe(4);
      expect(conditionalPutChecklist).toHaveBeenCalledWith(
        expect.objectContaining({ machines: newMachines }),
        3,
      );
    });

    it('returns 409 when version does not match (conflict)', async () => {
      const checklist = makeChecklist({ status: 'in_progress', version: 5 });
      const operatorUser = makeUser({ id: 'operator-1', role: 'operator' });
      mockedGetChecklist.mockResolvedValueOnce(checklist);
      mockedGetUser.mockResolvedValueOnce(operatorUser);

      const res = await request(app)
        .put(`/api/checklists/${checklist.id}/items`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ machines: [], version: 3 });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('modified');
    });

    it('does unconditional write when no version provided (backward compat)', async () => {
      const checklist = makeChecklist({ status: 'in_progress', version: 2 });
      const operatorUser = makeUser({ id: 'operator-1', role: 'operator' });
      mockedGetChecklist.mockResolvedValueOnce(checklist);
      mockedGetUser.mockResolvedValueOnce(operatorUser);

      const res = await request(app)
        .put(`/api/checklists/${checklist.id}/items`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ machines: [{ name: 'M', categories: [] }] });

      expect(res.status).toBe(200);
      // Still uses conditionalPutChecklist with the current version
      expect(conditionalPutChecklist).toHaveBeenCalledOnce();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /api/checklists/:id/submit
  // ────────────────────────────────────────────────────────────────
  describe('POST /api/checklists/:id/submit', () => {
    it('submits an in_progress checklist', async () => {
      const checklist = makeChecklist({ status: 'in_progress' });
      mockedGetChecklist.mockResolvedValueOnce(checklist);

      const res = await request(app)
        .post(`/api/checklists/${checklist.id}/submit`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('submitted');
      expect(res.body.endTime).toBeTruthy();
      expect(res.body.submittedAt).toBeTruthy();
      expect(conditionalStatusTransition).toHaveBeenCalledOnce();
    });

    it('returns 404 when checklist does not exist', async () => {
      mockedGetChecklist.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/checklists/nonexistent/submit')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Checklist not found');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /api/checklists/:id/approve
  // ────────────────────────────────────────────────────────────────
  describe('POST /api/checklists/:id/approve', () => {
    it('approves a checklist as admin', async () => {
      const checklist = makeSubmittedChecklist();
      mockedGetChecklist.mockResolvedValueOnce(checklist);

      const res = await request(app)
        .post(`/api/checklists/${checklist.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('approved');
      expect(conditionalStatusTransition).toHaveBeenCalledOnce();
    });

    it('returns 403 when operator attempts to approve', async () => {
      const res = await request(app)
        .post('/api/checklists/some-id/approve')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Admin access required');
    });

    it('returns 404 when checklist does not exist', async () => {
      mockedGetChecklist.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/checklists/nonexistent/approve')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Checklist not found');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // POST /api/checklists/:id/deny
  // ────────────────────────────────────────────────────────────────
  describe('POST /api/checklists/:id/deny', () => {
    it('denies a checklist as admin', async () => {
      const checklist = makeSubmittedChecklist();
      mockedGetChecklist.mockResolvedValueOnce(checklist);

      const res = await request(app)
        .post(`/api/checklists/${checklist.id}/deny`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('denied');
      expect(conditionalStatusTransition).toHaveBeenCalledOnce();
    });

    it('returns 403 when operator attempts to deny', async () => {
      const res = await request(app)
        .post('/api/checklists/some-id/deny')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Admin access required');
    });

    it('returns 404 when checklist does not exist', async () => {
      mockedGetChecklist.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/checklists/nonexistent/deny')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Checklist not found');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // DELETE /api/checklists/:id
  // ────────────────────────────────────────────────────────────────
  describe('DELETE /api/checklists/:id', () => {
    it('deletes a checklist as admin and returns 204', async () => {
      const checklist = makeChecklist();

      const res = await request(app)
        .delete(`/api/checklists/${checklist.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
      expect(conditionalDeleteChecklist).toHaveBeenCalledWith(checklist.id);
    });

    it('returns 403 when operator attempts to delete', async () => {
      const res = await request(app)
        .delete('/api/checklists/some-id')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Admin access required');
    });

    it('returns 404 when checklist does not exist', async () => {
      const condError = new Error('Conditional check failed');
      condError.name = 'ConditionalCheckFailedException';
      mockedConditionalDeleteChecklist.mockRejectedValueOnce(condError);

      const res = await request(app)
        .delete('/api/checklists/nonexistent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Checklist not found');
    });
  });

});
