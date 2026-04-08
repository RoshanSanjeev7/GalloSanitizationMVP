import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../__tests__/render-helpers';
import Settings from './Settings';

vi.mock('../services/api', () => ({
  default: {
    getStoredUser: vi.fn().mockReturnValue(null),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const adminState = {
  auth: {
    user: { id: 'admin-1', name: 'Admin User', email: 'admin@test.com', role: 'admin' as const },
    loading: false,
    error: null,
  },
};

const operatorState = {
  auth: {
    user: { id: 'op-1', name: 'Op User', email: 'op@test.com', role: 'operator' as const },
    loading: false,
    error: null,
  },
};

afterEach(cleanup);

describe('Settings', () => {
  it('shows user name and email', () => {
    renderWithProviders(<Settings />, { preloadedState: operatorState });

    expect(screen.getByText('Op User')).toBeInTheDocument();
    expect(screen.getByText('op@test.com')).toBeInTheDocument();
  });

  it('shows role label for Operator', () => {
    renderWithProviders(<Settings />, { preloadedState: operatorState });

    expect(screen.getByText('Operator')).toBeInTheDocument();
  });

  it('shows role label for Admin', () => {
    renderWithProviders(<Settings />, { preloadedState: adminState });

    expect(screen.getByText('Administrator')).toBeInTheDocument();
  });

  it('shows "Edit Role Assignments" link for admin', () => {
    renderWithProviders(<Settings />, { preloadedState: adminState });

    expect(screen.getByText('Edit Role Assignments')).toBeInTheDocument();
  });

  it('does not show "Edit Role Assignments" for operator', () => {
    renderWithProviders(<Settings />, { preloadedState: operatorState });

    expect(screen.queryByText('Edit Role Assignments')).not.toBeInTheDocument();
  });
});
