import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { getStore, setStore } from './store.js';
import type { User, Line, Template, Checklist } from '../types/index.js';

describe('Store', () => {
  beforeEach(() => {
    setStore({
      users: [],
      lines: [],
      templates: [],
      checklists: [],
    });
  });

  describe('getStore', () => {
    it('should return store data', () => {
      const store = getStore();
      expect(store).toBeDefined();
      expect(store.users).toEqual([]);
      expect(store.lines).toEqual([]);
      expect(store.templates).toEqual([]);
      expect(store.checklists).toEqual([]);
    });
  });

  describe('setStore', () => {
    it('should update store data', () => {
      const testUser: User = {
        id: 'test-id',
        name: 'Test User',
        email: 'test@example.com',
        password: 'password',
        role: 'operator',
      };

      setStore({
        users: [testUser],
        lines: [],
        templates: [],
        checklists: [],
      });

      const store = getStore();
      expect(store.users).toHaveLength(1);
      expect(store.users[0].name).toBe('Test User');
    });
  });

  describe('User data integrity (property-based)', () => {
    it('should preserve user data through store operations', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            email: fc.emailAddress(),
            password: fc.string({ minLength: 8, maxLength: 50 }),
            role: fc.constantFrom('operator' as const, 'admin' as const),
          }),
          (user) => {
            setStore({
              users: [user],
              lines: [],
              templates: [],
              checklists: [],
            });

            const store = getStore();
            const storedUser = store.users[0];

            return (
              storedUser.id === user.id &&
              storedUser.name === user.name &&
              storedUser.email === user.email &&
              storedUser.role === user.role
            );
          }
        )
      );
    });
  });
});
