import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ─── Mocks ──────────────────────────────────────────────────────────
// Must be declared before importing app so module-level calls are no-ops.

vi.mock('../data/seed-dynamo.js', () => ({
  seedIfEmpty: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../data/dynamo.js', () => ({
  getUserByEmail: vi.fn().mockResolvedValue(undefined),
  getUser: vi.fn().mockResolvedValue(undefined),
  getAllUsers: vi.fn().mockResolvedValue([]),
  putUser: vi.fn().mockResolvedValue(undefined),
  deleteUser: vi.fn().mockResolvedValue(undefined),
  getAllLines: vi.fn().mockResolvedValue([]),
  getLine: vi.fn().mockResolvedValue(undefined),
  putLine: vi.fn().mockResolvedValue(undefined),
  getAllTemplates: vi.fn().mockResolvedValue([]),
  getTemplate: vi.fn().mockResolvedValue(undefined),
  getTemplatesByLineId: vi.fn().mockResolvedValue([]),
  putTemplate: vi.fn().mockResolvedValue(undefined),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),
  getChecklist: vi.fn().mockResolvedValue(undefined),
  putChecklist: vi.fn().mockResolvedValue(undefined),
  deleteChecklist: vi.fn().mockResolvedValue(undefined),
  queryChecklists: vi.fn().mockResolvedValue([]),
  getAllChecklists: vi.fn().mockResolvedValue([]),
  getChecklistsByOperator: vi.fn().mockResolvedValue([]),
  getChecklistsByStatus: vi.fn().mockResolvedValue([]),
  docClient: {},
}));

vi.mock('../data/s3.js', () => ({
  uploadImage: vi.fn().mockResolvedValue('https://s3.example.com/image.jpg'),
  getSignedImageUrl: vi.fn().mockResolvedValue('https://s3.example.com/signed.jpg'),
}));

import { app } from '../index.js';
import { getUserByEmail, getUser } from '../data/dynamo.js';
import { makeUser } from './factories.js';

const mockedGetUserByEmail = vi.mocked(getUserByEmail);
const mockedGetUser = vi.mocked(getUser);

/**
 * Integration test: authentication flow
 *
 * Tests login, token usage, and auth guard behavior end-to-end
 * through the real Express app with mocked data layer.
 */
describe('Auth flow integration', () => {
  const testUser = makeUser({
    id: 'user-1',
    name: 'Test User',
    email: 'test@gallo.com',
    password: 'secret123',
    role: 'operator',
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('login with valid credentials returns token and user without password', async () => {
    mockedGetUserByEmail.mockResolvedValueOnce(testUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@gallo.com', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe('user-1');
    expect(res.body.user.name).toBe('Test User');
    expect(res.body.user.email).toBe('test@gallo.com');
    expect(res.body.user.role).toBe('operator');
    // Password must not be returned
    expect(res.body.user.password).toBeUndefined();
  });

  it('login with wrong password returns 401', async () => {
    mockedGetUserByEmail.mockResolvedValueOnce(testUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@gallo.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('login with missing fields returns 400', async () => {
    const res1 = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@gallo.com' });

    expect(res1.status).toBe(400);
    expect(res1.body.error).toBe('Email and password required');

    const res2 = await request(app)
      .post('/api/auth/login')
      .send({ password: 'secret123' });

    expect(res2.status).toBe(400);
    expect(res2.body.error).toBe('Email and password required');

    const res3 = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res3.status).toBe(400);
    expect(res3.body.error).toBe('Email and password required');
  });

  it('use token from login to access /api/auth/me returns user', async () => {
    // First, login to get a token
    mockedGetUserByEmail.mockResolvedValueOnce(testUser);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@gallo.com', password: 'secret123' });

    expect(loginRes.status).toBe(200);
    const { token } = loginRes.body;

    // Then, use that token to access /me
    mockedGetUser.mockResolvedValueOnce(testUser);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.id).toBe('user-1');
    expect(meRes.body.email).toBe('test@gallo.com');
    expect(meRes.body.role).toBe('operator');
    // Password must not be returned
    expect(meRes.body.password).toBeUndefined();
  });

  it('access /api/auth/me without token returns 401', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('No token provided');
  });
});
