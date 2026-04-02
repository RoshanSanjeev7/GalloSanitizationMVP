import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import authReducer, { logout, clearError, loginUser } from './authSlice.js';
import type { UserPublic } from '../../services/api.js';

describe('authSlice', () => {
  const initialState = {
    user: null,
    loading: false,
    error: null,
  };

  describe('logout', () => {
    it('should clear user on logout', () => {
      const loggedInState = {
        user: {
          id: 'test-id',
          name: 'Test User',
          email: 'test@example.com',
          role: 'operator' as const,
        },
        loading: false,
        error: null,
      };

      const state = authReducer(loggedInState, logout());

      expect(state.user).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe('clearError', () => {
    it('should clear error state', () => {
      const errorState = {
        user: null,
        loading: false,
        error: 'Some error',
      };

      const state = authReducer(errorState, clearError());

      expect(state.error).toBeNull();
    });
  });

  describe('loginUser async thunk', () => {
    it('should set loading on pending', () => {
      const action = { type: loginUser.pending.type };
      const state = authReducer(initialState, action);

      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('should set user on fulfilled', () => {
      const user: UserPublic = {
        id: 'test-id',
        name: 'Test User',
        email: 'test@example.com',
        role: 'operator',
      };

      const action = { type: loginUser.fulfilled.type, payload: user };
      const state = authReducer({ ...initialState, loading: true }, action);

      expect(state.loading).toBe(false);
      expect(state.user).toEqual(user);
    });

    it('should set error on rejected', () => {
      const action = {
        type: loginUser.rejected.type,
        payload: 'Invalid credentials',
      };
      const state = authReducer({ ...initialState, loading: true }, action);

      expect(state.loading).toBe(false);
      expect(state.error).toBe('Invalid credentials');
    });
  });

  describe('State transitions (property-based)', () => {
    it('should always clear user on logout regardless of initial state', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            email: fc.emailAddress(),
            role: fc.constantFrom('operator' as const, 'admin' as const),
          }),
          fc.boolean(),
          fc.option(fc.string(), { nil: null }),
          (user, loading, error) => {
            const loggedInState = { user, loading, error };
            const state = authReducer(loggedInState, logout());
            return state.user === null;
          }
        )
      );
    });

    it('should always clear error on clearError regardless of user state', () => {
      fc.assert(
        fc.property(
          fc.option(
            fc.record({
              id: fc.uuid(),
              name: fc.string({ minLength: 1, maxLength: 100 }),
              email: fc.emailAddress(),
              role: fc.constantFrom('operator' as const, 'admin' as const),
            }),
            { nil: null }
          ),
          fc.string({ minLength: 1 }),
          (user, errorMsg) => {
            const errorState = { user, loading: false, error: errorMsg };
            const state = authReducer(errorState, clearError());
            return state.error === null;
          }
        )
      );
    });
  });
});
