import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { makeLine, makeOperatorToken } from '../__tests__/factories.js';

vi.mock('../data/seed-dynamo.js', () => ({
  seedIfEmpty: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../data/dynamo.js', () => ({
  getAllLines: vi.fn(),
  // Other dynamo functions the app may import at startup
  getAllUsers: vi.fn().mockResolvedValue([]),
  getUserByEmail: vi.fn(),
  putUser: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
  getAllTemplates: vi.fn().mockResolvedValue([]),
  getTemplate: vi.fn(),
  putTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
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

import { getAllLines } from '../data/dynamo.js';
import { app } from '../index.js';

const mockedGetAllLines = vi.mocked(getAllLines);

describe('Lines routes', () => {
  const operatorToken = makeOperatorToken();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/lines', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/lines');
      expect(res.status).toBe(401);
    });

    it('returns an empty array when no lines exist', async () => {
      mockedGetAllLines.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/lines')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all lines when authenticated', async () => {
      const l1 = makeLine({ id: 'line-91', name: 'Line 91' });
      const l2 = makeLine({ id: 'line-92', name: 'Line 92' });
      mockedGetAllLines.mockResolvedValue([l1, l2]);

      const res = await request(app)
        .get('/api/lines')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('Line 91');
      expect(res.body[1].name).toBe('Line 92');
    });
  });
});
