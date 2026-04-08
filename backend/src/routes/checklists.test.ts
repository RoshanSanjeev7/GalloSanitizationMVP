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
  deleteChecklist: vi.fn().mockResolvedValue(undefined),
  getLine: vi.fn().mockResolvedValue(undefined),
  getUser: vi.fn().mockResolvedValue(undefined),
  getTemplatesByLineId: vi.fn().mockResolvedValue([]),
  getAllTemplates: vi.fn().mockResolvedValue([]),
  // Other dynamo exports used by other routes that also get imported via app
  getUserByEmail: vi.fn().mockResolvedValue(undefined),
  getAllUsers: vi.fn().mockResolvedValue([]),
  putUser: vi.fn().mockResolvedValue(undefined),
  deleteUser: vi.fn().mockResolvedValue(undefined),
  getAllLines: vi.fn().mockResolvedValue([]),
  putLine: vi.fn().mockResolvedValue(undefined),
  getTemplate: vi.fn().mockResolvedValue(undefined),
  putTemplate: vi.fn().mockResolvedValue(undefined),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),
  getAllChecklists: vi.fn().mockResolvedValue([]),
  getChecklistsByOperator: vi.fn().mockResolvedValue([]),
  getChecklistsByStatus: vi.fn().mockResolvedValue([]),
  docClient: {},
}));

// Mock S3 module used by the images route (also mounted under /api/checklists)
vi.mock('../data/s3.js', () => ({
  uploadImage: vi.fn().mockResolvedValue('https://s3.example.com/image.jpg'),
  getSignedImageUrl: vi.fn().mockResolvedValue('https://s3.example.com/signed.jpg'),
}));

import { app } from '../index.js';
import {
  queryChecklists,
  getChecklist,
  putChecklist,
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
      expect(res.body).toHaveLength(2);
      // Newer first
      expect(res.body[0].id).toBe(newer.id);
      expect(res.body[1].id).toBe(older.id);
    });

    it('passes status query param to queryChecklists', async () => {
      mockedQueryChecklists.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/checklists?status=submitted')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(mockedQueryChecklists).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'submitted' }),
      );
    });

    it('passes operatorId and lineId query params', async () => {
      mockedQueryChecklists.mockResolvedValueOnce([]);

      await request(app)
        .get('/api/checklists?operatorId=op-1&lineId=line-1')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(mockedQueryChecklists).toHaveBeenCalledWith(
        expect.objectContaining({ operatorId: 'op-1', lineId: 'line-1' }),
      );
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
      expect(res.body.machines).toHaveLength(1);
      expect(putChecklist).toHaveBeenCalledOnce();
    });

    it('falls back to getAllTemplates when no line-specific templates exist', async () => {
      const line = makeLine({ id: 'line-2' });
      const user = makeUser({ id: 'operator-1' });
      const fallbackTemplate = makeTemplate({ lineId: 'line-other' });

      mockedGetLine.mockResolvedValueOnce(line);
      mockedGetUser.mockResolvedValueOnce(user);
      mockedGetTemplatesByLineId.mockResolvedValueOnce([]);
      mockedGetAllTemplates.mockResolvedValueOnce([fallbackTemplate]);

      const res = await request(app)
        .post('/api/checklists')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ lineId: 'line-2' });

      expect(res.status).toBe(201);
      expect(res.body.templateId).toBe(fallbackTemplate.id);
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
      mockedGetAllTemplates.mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/api/checklists')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ lineId: 'line-1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No template available for this line');
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
      expect(putChecklist).toHaveBeenCalledOnce();
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
      expect(putChecklist).toHaveBeenCalledOnce();
    });

    it('returns 404 when checklist does not exist', async () => {
      mockedGetChecklist.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/checklists/nonexistent/submit')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Checklist not found');
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
      expect(putChecklist).toHaveBeenCalledOnce();
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
      expect(res.body.error).toBe('Checklist not found');
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
      expect(putChecklist).toHaveBeenCalledOnce();
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
      expect(res.body.error).toBe('Checklist not found');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // DELETE /api/checklists/:id
  // ────────────────────────────────────────────────────────────────
  describe('DELETE /api/checklists/:id', () => {
    it('deletes a checklist as admin and returns 204', async () => {
      const checklist = makeChecklist();
      mockedGetChecklist.mockResolvedValueOnce(checklist);

      const res = await request(app)
        .delete(`/api/checklists/${checklist.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
      expect(deleteChecklist).toHaveBeenCalledWith(checklist.id);
    });

    it('returns 403 when operator attempts to delete', async () => {
      const res = await request(app)
        .delete('/api/checklists/some-id')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Admin access required');
    });

    it('returns 404 when checklist does not exist', async () => {
      mockedGetChecklist.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .delete('/api/checklists/nonexistent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Checklist not found');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // GET /api/checklists/:id/pdf
  // ────────────────────────────────────────────────────────────────
  describe('GET /api/checklists/:id/pdf', () => {
    it('returns a PDF for an existing checklist as admin', async () => {
      const checklist = makeSubmittedChecklist({
        lineName: 'Line 91',
        operatorName: 'Test Op',
      });
      mockedGetChecklist.mockResolvedValueOnce(checklist);

      const res = await request(app)
        .get(`/api/checklists/${checklist.id}/pdf`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('.pdf');
      // PDF starts with %PDF magic bytes
      expect(res.body.slice(0, 5).toString()).toBe('%PDF-');
    });

    it('returns 403 when operator attempts to export PDF', async () => {
      const res = await request(app)
        .get('/api/checklists/some-id/pdf')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Admin access required');
    });

    it('returns 404 when checklist does not exist', async () => {
      mockedGetChecklist.mockResolvedValueOnce(undefined);

      const res = await request(app)
        .get('/api/checklists/nonexistent/pdf')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Checklist not found');
    });
  });
});
