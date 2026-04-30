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
  createUserWithEmailLock: vi.fn().mockResolvedValue(undefined),
  deleteUserWithEmailLock: vi.fn().mockResolvedValue(undefined),
  // Other dynamo functions the app may import at startup
  getAllLines: vi.fn().mockResolvedValue([]),
  getAllTemplates: vi.fn().mockResolvedValue([]),
  getAllChecklists: vi.fn().mockResolvedValue([]),
  getChecklist: vi.fn(),
  getChecklistsByOperator: vi.fn().mockResolvedValue([]),
  getChecklistsByStatus: vi.fn().mockResolvedValue([]),
  queryChecklists: vi.fn().mockResolvedValue([]),
  putChecklist: vi.fn(),
  conditionalPutChecklist: vi.fn().mockResolvedValue(undefined),
  conditionalStatusTransition: vi.fn().mockResolvedValue(undefined),
  conditionalDeleteChecklist: vi.fn().mockResolvedValue(undefined),
  markChecklistViewed: vi.fn().mockResolvedValue(undefined),
  updateChecklistMachine: vi.fn().mockResolvedValue(undefined),
  appendChecklistImages: vi.fn().mockResolvedValue(undefined),
  removeChecklistImage: vi.fn().mockResolvedValue(undefined),
  deleteChecklist: vi.fn(),
  getTemplate: vi.fn(),
  putTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  getLine: vi.fn(),
  putLine: vi.fn(),
  getTemplatesByLineId: vi.fn().mockResolvedValue([]),
  docClient: {},
}));

vi.mock('../data/s3.js', () => ({
  uploadImage: vi.fn().mockResolvedValue('mock-key'),
  getImageUrl: vi.fn().mockResolvedValue('https://example.com/image.jpg'),
  getImageUrls: vi.fn().mockResolvedValue({}),
  deleteImage: vi.fn().mockResolvedValue(undefined),
  getSignedImageUrl: vi.fn().mockResolvedValue('https://example.com/signed.jpg'),
}));

vi.mock('../data/sqs.js', () => ({
  sendPdfGenerationMessage: vi.fn().mockResolvedValue(undefined),
}));

import { getAllUsers, getUserByEmail, putUser, getUser, deleteUser, createUserWithEmailLock, deleteUserWithEmailLock } from '../data/dynamo.js';
import { app } from '../index.js';

const mockedGetAllUsers = vi.mocked(getAllUsers);
const mockedGetUserByEmail = vi.mocked(getUserByEmail);
const mockedPutUser = vi.mocked(putUser);
const mockedGetUser = vi.mocked(getUser);
const mockedDeleteUser = vi.mocked(deleteUser);
const mockedCreateUserWithEmailLock = vi.mocked(createUserWithEmailLock);
const mockedDeleteUserWithEmailLock = vi.mocked(deleteUserWithEmailLock);

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

    it('returns paginated response with items, total, hasMore', async () => {
      const user = makeUser({ id: 'u1', name: 'Alice', email: 'alice@test.com', password: 'secret' });
      mockedGetAllUsers.mockResolvedValue([user]);

      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('hasMore');
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).not.toHaveProperty('password');
      expect(res.body.items[0].name).toBe('Alice');
      expect(res.body.total).toBe(1);
      expect(res.body.hasMore).toBe(false);
    });

    it('paginates users with limit and offset', async () => {
      const users = Array.from({ length: 5 }, (_, i) =>
        makeUser({ id: `u${i}`, name: `User ${i}`, email: `user${i}@test.com` }),
      );
      mockedGetAllUsers.mockResolvedValue(users);

      const res = await request(app)
        .get('/api/users?limit=2&offset=1')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(5);
      expect(res.body.hasMore).toBe(true);
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
      const txError = new Error('Transaction cancelled');
      txError.name = 'TransactionCanceledException';
      mockedCreateUserWithEmailLock.mockRejectedValueOnce(txError);

      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bob', email: 'dup@test.com', password: 'pass', role: 'operator' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already exists/i);
    });

    it('returns 201 and creates user on success', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bob', email: 'bob@test.com', password: 'pass', role: 'operator' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Bob');
      expect(res.body).not.toHaveProperty('password');
      expect(mockedCreateUserWithEmailLock).toHaveBeenCalledOnce();
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

    it('rejects assigning two factories to an operator', async () => {
      const user = makeUser({ id: 'u1', role: 'operator', factoryIds: ['f1'] });
      mockedGetUser.mockResolvedValue(user);

      const res = await request(app)
        .put('/api/users/u1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ factoryIds: ['f1', 'f2'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/exactly one factory/i);
      expect(mockedPutUser).not.toHaveBeenCalled();
    });

    it('rejects assigning zero factories to an operator', async () => {
      const user = makeUser({ id: 'u1', role: 'operator', factoryIds: ['f1'] });
      mockedGetUser.mockResolvedValue(user);

      const res = await request(app)
        .put('/api/users/u1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ factoryIds: [] });

      expect(res.status).toBe(400);
      expect(mockedPutUser).not.toHaveBeenCalled();
    });

    it('accepts a single factory for an operator', async () => {
      const user = makeUser({ id: 'u1', role: 'operator', factoryIds: [] });
      mockedGetUser.mockResolvedValue(user);
      mockedPutUser.mockResolvedValue(undefined);

      const res = await request(app)
        .put('/api/users/u1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ factoryIds: ['f1'] });

      expect(res.status).toBe(200);
      expect(res.body.factoryIds).toEqual(['f1']);
    });

    it('allows admins to keep multiple factories', async () => {
      const user = makeUser({ id: 'u1', role: 'admin', factoryIds: ['f1'] });
      mockedGetUser.mockResolvedValue(user);
      mockedPutUser.mockResolvedValue(undefined);

      const res = await request(app)
        .put('/api/users/u1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ factoryIds: ['f1', 'f2', 'f3'] });

      expect(res.status).toBe(200);
      expect(res.body.factoryIds).toEqual(['f1', 'f2', 'f3']);
    });

    it('rejects role change admin → operator if existing factoryIds is not exactly one', async () => {
      // Admin had cross-facility access; demoting to operator without first
      // trimming factoryIds to a single entry must fail (the validation
      // runs on the post-update state).
      const user = makeUser({ id: 'u1', role: 'admin', factoryIds: ['f1', 'f2'] });
      mockedGetUser.mockResolvedValue(user);
      // Need at least one other admin so the demotion isn't blocked by
      // the last-admin guard.
      mockedGetAllUsers.mockResolvedValue([user, makeUser({ id: 'u2', role: 'admin' })]);

      const res = await request(app)
        .put('/api/users/u1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'operator' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/exactly one factory/i);
      expect(mockedPutUser).not.toHaveBeenCalled();
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

      const res = await request(app)
        .delete('/api/users/u1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
      expect(mockedDeleteUserWithEmailLock).toHaveBeenCalledWith('u1', user.email);
    });
  });
});
