import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

describe('Auth', () => {
  describe('JWT token generation', () => {
    it('should create valid JWT tokens', () => {
      const payload = { userId: 'test-id', role: 'operator' };
      const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '24h' });

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
});
