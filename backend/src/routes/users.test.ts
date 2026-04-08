import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { makeUser, makeAdminToken, makeOperatorToken } from '../__tests__/factories.js';

vi.mock('../data/seed-dynamo.js', () => ({
  seedIfEmpty: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../data/dynamo.js', () => ({
  getAllUsers: vi.fn(),
  getUserByEmail: vi.fn(),
  putUser: vi.fn(),
  getUser: vi.fn(),
  deleteUser: vi.fn(),
  // Other dynamo functions the app may import at startup
  getAllLines: vi.fn().mockResolvedValue([]),
  getAllTemplates: vi.fn().mockResolvedValue([]),
  getAllChecklists: vi.fn().mockResolvedValue([]),
  getChecklist: vi.fn(),
  getChecklistsByOperator: vi.fn().mockResolvedValue([]),
  getChecklistsByStatus: vi.fn().mockResolvedValue([]),
  queryChecklists: vi.fn().mockResolvedValue([]),
  putChecklist: vi.fn(),
  deleteChecklist: vi.fn(),
  getTemplate: vi.fn(),
  putTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  getLine: vi.fn(),
  putLine: vi.fn(),
  getTemplatesByLineId: vi.fn().mockResolvedValue([]),
}));

import { getAllUsers, getUserByEmail, putUser, getUser, deleteUser } from '../data/dynamo.js';
import { app } from '../index.js';

const mockedGetAllUsers = vi.mocked(getAllUsers);
const mockedGetUserByEmail = vi.mocked(getUserByEmail);
const mockedPutUser = vi.mocked(putUser);
const mockedGetUser = vi.mocked(getUser);
const mockedDeleteUser = vi.mocked(deleteUser);

describe('Users routes', () => {
  const adminToken = makeAdminToken();
  const operatorToken = makeOperatorToken();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GET /api/users ──────────────────────────────────────────────────

  describe('GET /api/users', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(401);
    });

    it('returns users without password field', async () => {
      const user = makeUser({ id: 'u1', name: 'Alice', email: 'alice@test.com', password: 'secret' });
      mockedGetAllUsers.mockResolvedValue([user]);

      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).not.toHaveProperty('password');
      expect(res.body[0].name).toBe('Alice');
    });
  });

  // ── POST /api/users ─────────────────────────────────────────────────

  describe('POST /api/users', () => {
    it('returns 403 when called by an operator', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ name: 'Bob', email: 'bob@test.com', password: 'pass', role: 'operator' });

      expect(res.status).toBe(403);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bob' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });

    it('returns 409 when email already exists', async () => {
      mockedGetUserByEmail.mockResolvedValue(makeUser({ email: 'dup@test.com' }));

      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bob', email: 'dup@test.com', password: 'pass', role: 'operator' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already exists/i);
    });

    it('returns 201 and creates user on success', async () => {
      mockedGetUserByEmail.mockResolvedValue(undefined);
      mockedPutUser.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bob', email: 'bob@test.com', password: 'pass', role: 'operator' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Bob');
      expect(res.body).not.toHaveProperty('password');
      expect(mockedPutUser).toHaveBeenCalledOnce();
    });
  });

  // ── PUT /api/users/:id ──────────────────────────────────────────────

  describe('PUT /api/users/:id', () => {
    it('returns 403 when called by an operator', async () => {
      const res = await request(app)
        .put('/api/users/u1')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ role: 'admin' });

      expect(res.status).toBe(403);
    });

    it('returns 404 when user is not found', async () => {
      mockedGetUser.mockResolvedValue(undefined);

      const res = await request(app)
        .put('/api/users/nonexistent')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'admin' });

      expect(res.status).toBe(404);
    });

    it('updates user role and returns user without password', async () => {
      const user = makeUser({ id: 'u1', role: 'operator' });
      mockedGetUser.mockResolvedValue(user);
      mockedPutUser.mockResolvedValue(undefined);

      const res = await request(app)
        .put('/api/users/u1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('admin');
      expect(res.body).not.toHaveProperty('password');
    });
  });

  // ── DELETE /api/users/:id ───────────────────────────────────────────

  describe('DELETE /api/users/:id', () => {
    it('returns 404 when user is not found', async () => {
      mockedGetUser.mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/users/nonexistent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 204 on successful deletion', async () => {
      const user = makeUser({ id: 'u1' });
      mockedGetUser.mockResolvedValue(user);
      mockedDeleteUser.mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/users/u1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
      expect(mockedDeleteUser).toHaveBeenCalledWith('u1');
    });
  });
});
