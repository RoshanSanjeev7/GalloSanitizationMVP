import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { makeTemplate, makeAdminToken, makeOperatorToken } from '../__tests__/factories.js';

vi.mock('../data/seed-dynamo.js', () => ({
  seedIfEmpty: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../data/dynamo.js', () => ({
  getAllTemplates: vi.fn(),
  getTemplate: vi.fn(),
  putTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  // Other dynamo functions the app may import at startup
  getAllUsers: vi.fn().mockResolvedValue([]),
  getUserByEmail: vi.fn(),
  putUser: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
  getAllLines: vi.fn().mockResolvedValue([]),
  getAllChecklists: vi.fn().mockResolvedValue([]),
  getChecklist: vi.fn(),
  getChecklistsByOperator: vi.fn().mockResolvedValue([]),
  getChecklistsByStatus: vi.fn().mockResolvedValue([]),
  queryChecklists: vi.fn().mockResolvedValue([]),
  putChecklist: vi.fn(),
  deleteChecklist: vi.fn(),
  getLine: vi.fn(),
  putLine: vi.fn(),
  getTemplatesByLineId: vi.fn().mockResolvedValue([]),
}));

import { getAllTemplates, getTemplate, putTemplate, deleteTemplate } from '../data/dynamo.js';
import { app } from '../index.js';

const mockedGetAllTemplates = vi.mocked(getAllTemplates);
const mockedGetTemplate = vi.mocked(getTemplate);
const mockedPutTemplate = vi.mocked(putTemplate);
const mockedDeleteTemplate = vi.mocked(deleteTemplate);

describe('Templates routes', () => {
  const adminToken = makeAdminToken();
  const operatorToken = makeOperatorToken();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GET /api/templates ──────────────────────────────────────────────

  describe('GET /api/templates', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/templates');
      expect(res.status).toBe(401);
    });

    it('returns all templates', async () => {
      const t1 = makeTemplate({ id: 't1', title: 'Deep Clean Line 91' });
      const t2 = makeTemplate({ id: 't2', title: 'Deep Clean Line 92' });
      mockedGetAllTemplates.mockResolvedValue([t1, t2]);

      const res = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].title).toBe('Deep Clean Line 91');
    });
  });

  // ── GET /api/templates/:id ──────────────────────────────────────────

  describe('GET /api/templates/:id', () => {
    it('returns 404 when template is not found', async () => {
      mockedGetTemplate.mockResolvedValue(undefined);

      const res = await request(app)
        .get('/api/templates/nonexistent')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(404);
    });

    it('returns the template when found', async () => {
      const tmpl = makeTemplate({ id: 't1', title: 'Line 91 Template' });
      mockedGetTemplate.mockResolvedValue(tmpl);

      const res = await request(app)
        .get('/api/templates/t1')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('t1');
      expect(res.body.title).toBe('Line 91 Template');
    });
  });

  // ── POST /api/templates ─────────────────────────────────────────────

  describe('POST /api/templates', () => {
    it('returns 403 when called by an operator', async () => {
      const res = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ title: 'New', lineId: 'l1', machines: [] });

      expect(res.status).toBe(403);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'New' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });

    it('returns 201 and creates template on success', async () => {
      mockedPutTemplate.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Line 93 Deep Clean', lineId: 'l3', machines: [] });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toBe('Line 93 Deep Clean');
      expect(res.body.lineId).toBe('l3');
      expect(mockedPutTemplate).toHaveBeenCalledOnce();
    });
  });

  // ── DELETE /api/templates/:id ───────────────────────────────────────

  describe('DELETE /api/templates/:id', () => {
    it('returns 404 when template is not found', async () => {
      mockedGetTemplate.mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/templates/nonexistent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 204 on successful deletion', async () => {
      const tmpl = makeTemplate({ id: 't1' });
      mockedGetTemplate.mockResolvedValue(tmpl);
      mockedDeleteTemplate.mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/templates/t1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
      expect(mockedDeleteTemplate).toHaveBeenCalledWith('t1');
    });
  });
});
