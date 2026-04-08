import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '../config/env.js';

vi.mock('../data/seed-dynamo.js', () => ({
  seedIfEmpty: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../data/dynamo.js', () => ({
  getUserByEmail: vi.fn(),
  getUser: vi.fn(),
  getAllUsers: vi.fn().mockResolvedValue([]),
  putUser: vi.fn(),
  deleteUser: vi.fn(),
  getAllLines: vi.fn().mockResolvedValue([]),
  putLine: vi.fn(),
  getAllTemplates: vi.fn().mockResolvedValue([]),
  getTemplate: vi.fn(),
  putTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  getTemplatesByLineId: vi.fn().mockResolvedValue([]),
  getLine: vi.fn(),
  queryChecklists: vi.fn().mockResolvedValue([]),
  getChecklist: vi.fn(),
  putChecklist: vi.fn(),
  deleteChecklist: vi.fn(),
  getAllChecklists: vi.fn().mockResolvedValue([]),
  getChecklistsByOperator: vi.fn().mockResolvedValue([]),
  getChecklistsByStatus: vi.fn().mockResolvedValue([]),
  docClient: {},
}));

vi.mock('../data/s3.js', () => ({
  uploadImage: vi.fn(),
  getImageUrl: vi.fn(),
  getImageUrls: vi.fn(),
  deleteImage: vi.fn(),
}));

import { app } from '../index.js';
import { getUser } from '../data/dynamo.js';
import { makeUser, makeAdminToken, makeOperatorToken } from '../__tests__/factories.js';

describe('Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('JWT token generation', () => {
    it('should create valid JWT tokens', () => {
      const payload = { userId: 'test-id', role: 'operator' };
      const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const decoded = jwt.verify(token, config.jwtSecret) as {
        userId: string;
        role: string;
      };
      expect(decoded.userId).toBe('test-id');
      expect(decoded.role).toBe('operator');
    });

    it('should reject invalid tokens', () => {
      expect(() => {
        jwt.verify('invalid-token', config.jwtSecret);
      }).toThrow();
    });
  });

  describe('JWT payload validation (property-based)', () => {
    it('should encode and decode any valid user payload', () => {
      fc.assert(
        fc.property(
          fc.record({
            userId: fc.uuid(),
            role: fc.constantFrom('operator', 'admin'),
          }),
          (payload) => {
            const token = jwt.sign(payload, config.jwtSecret, {
              expiresIn: '1h',
            });
            const decoded = jwt.verify(token, config.jwtSecret) as typeof payload;

            return (
              decoded.userId === payload.userId && decoded.role === payload.role
            );
          }
        )
      );
    });
  });

  describe('POST /auth/refresh', () => {
    it('returns a new token with updated role', async () => {
      const user = makeUser({ id: 'admin-1', role: 'admin' });
      vi.mocked(getUser).mockResolvedValueOnce(user);
      const token = makeAdminToken('admin-1');

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.role).toBe('admin');
      expect(res.body.user).not.toHaveProperty('password');

      // Verify new token is valid
      const decoded = jwt.verify(res.body.token, config.jwtSecret) as { userId: string; role: string };
      expect(decoded.userId).toBe('admin-1');
      expect(decoded.role).toBe('admin');
    });

    it('returns 404 when user no longer exists', async () => {
      vi.mocked(getUser).mockResolvedValueOnce(undefined);
      const token = makeOperatorToken('deleted-user');

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns 401 for invalid token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });
});
