import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { authMiddleware, adminOnly, type AuthRequest } from './auth.js';
import type { Response, NextFunction } from 'express';

function mockReq(headers: Record<string, string> = {}): AuthRequest {
  return {
    headers,
  } as AuthRequest;
}

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('authMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('returns 401 when no Authorization header is present', () => {
    const req = mockReq();
    const res = mockRes();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is missing Bearer prefix', () => {
    const req = mockReq({ authorization: 'Token some-token' });
    const res = mockRes();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is invalid', () => {
    const req = mockReq({ authorization: 'Bearer invalid-token' });
    const res = mockRes();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is expired', () => {
    const expiredToken = jwt.sign(
      { userId: 'u1', role: 'operator' },
      config.jwtSecret,
      { expiresIn: '-1s' },
    );
    const req = mockReq({ authorization: `Bearer ${expiredToken}` });
    const res = mockRes();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.userId and req.userRole from a valid token and calls next', () => {
    const token = jwt.sign(
      { userId: 'user-42', role: 'admin' },
      config.jwtSecret,
      { expiresIn: '1h' },
    );
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();

    authMiddleware(req, res, next);

    expect(req.userId).toBe('user-42');
    expect(req.userRole).toBe('admin');
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('adminOnly', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('returns 403 when userRole is operator', () => {
    const req = { userRole: 'operator' } as AuthRequest;
    const res = mockRes();

    adminOnly(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when userRole is admin', () => {
    const req = { userRole: 'admin' } as AuthRequest;
    const res = mockRes();

    adminOnly(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
