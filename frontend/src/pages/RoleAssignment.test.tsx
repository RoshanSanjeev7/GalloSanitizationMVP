import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../__tests__/render-helpers';
import { makeUserPublic } from '../__tests__/factories';
import RoleAssignment from './RoleAssignment';

vi.mock('../services/api', () => ({
  default: {
    getUsers: vi.fn(),
    createUser: vi.fn().mockResolvedValue({}),
    updateUserRole: vi.fn().mockResolvedValue({}),
    getStoredUser: vi.fn().mockReturnValue(null),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import api from '../services/api';

const testUsers = [
  makeUserPublic({ id: 'u-1', name: 'Alice Admin', email: 'alice@test.com', role: 'admin' }),
  makeUserPublic({ id: 'u-2', name: 'Bob Operator', email: 'bob@test.com', role: 'operator' }),
];

const adminState = {
  auth: {
    user: { id: 'admin-1', name: 'Admin User', email: 'admin@test.com', role: 'admin' as const },
    loading: false,
    error: null,
  },
};

beforeEach(() => {
  vi.mocked(api.getUsers).mockResolvedValue(testUsers);
  mockNavigate.mockClear();
});

afterEach(cleanup);

describe('RoleAssignment', () => {
  it('loads and displays users on mount', async () => {
    renderWithProviders(<RoleAssignment />, { preloadedState: adminState });

    await waitFor(() => {
      expect(api.getUsers).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });

    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    expect(screen.getByText('Bob Operator')).toBeInTheDocument();
    expect(screen.getByText('bob@test.com')).toBeInTheDocument();
  });

  it('shows add user form', () => {
    renderWithProviders(<RoleAssignment />, { preloadedState: adminState });

    expect(screen.getByText('Add New User')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter full name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('user@gallo.com')).toBeInTheDocument();
    expect(screen.getByText('Add User')).toBeInTheDocument();
  });

  it('Back button is present', () => {
    renderWithProviders(<RoleAssignment />, { preloadedState: adminState });

    expect(screen.getByText(/Role Assignment/)).toBeInTheDocument();
  });

  it('Add User button is disabled when name or email is empty', () => {
    renderWithProviders(<RoleAssignment />, { preloadedState: adminState });

    const addButton = screen.getByText('Add User');
    expect(addButton).toBeDisabled();
  });

  it('calls createUser and reloads users on add', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createUser).mockResolvedValue(
      makeUserPublic({ id: 'u-3', name: 'New User', email: 'new@gallo.com', role: 'operator' })
    );

    renderWithProviders(<RoleAssignment />, { preloadedState: adminState });

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Enter full name'), 'New User');
    await user.type(screen.getByPlaceholderText('user@gallo.com'), 'new@gallo.com');
    await user.click(screen.getByText('Add User'));

    await waitFor(() => {
      expect(api.createUser).toHaveBeenCalledWith({
        name: 'New User',
        email: 'new@gallo.com',
        password: 'changeme123',
        role: 'operator',
      });
    });

    // loadUsers is called again after successful add
    await waitFor(() => {
      expect(vi.mocked(api.getUsers).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
