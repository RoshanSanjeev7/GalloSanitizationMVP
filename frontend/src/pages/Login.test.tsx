import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../__tests__/render-helpers';
import Login from './Login';

vi.mock('../services/api', () => ({
  default: {
    login: vi.fn(),
    logout: vi.fn(),
    getStoredUser: vi.fn().mockReturnValue(null),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Login', () => {
  it('renders sign-in heading', () => {
    renderWithProviders(<Login />);
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders email and password inputs', () => {
    renderWithProviders(<Login />);
    expect(screen.getByPlaceholderText('user@gallo.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••')).toBeInTheDocument();
  });

  it('renders the Sign In submit button', () => {
    renderWithProviders(<Login />);
    const button = screen.getByRole('button', { name: /sign in/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('shows error message when Redux state has error', () => {
    renderWithProviders(<Login />, {
      preloadedState: {
        auth: { user: null, loading: false, error: 'Invalid credentials' },
      },
    });
    expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
  });

  it('shows "Signing in..." when loading state is true', () => {
    renderWithProviders(<Login />, {
      preloadedState: {
        auth: { user: null, loading: true, error: null },
      },
    });
    expect(screen.getByRole('button', { name: /signing in/i })).toBeInTheDocument();
  });

  it('disables the submit button while loading', () => {
    renderWithProviders(<Login />, {
      preloadedState: {
        auth: { user: null, loading: true, error: null },
      },
    });
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });

  it('allows typing into email and password fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Login />);

    const emailInput = screen.getByPlaceholderText('user@gallo.com');
    const passwordInput = screen.getByPlaceholderText('••••••');

    await user.type(emailInput, 'test@gallo.com');
    await user.type(passwordInput, 'secret123');

    expect(emailInput).toHaveValue('test@gallo.com');
    expect(passwordInput).toHaveValue('secret123');
  });

  it('displays demo credentials section', () => {
    renderWithProviders(<Login />);
    expect(screen.getByText('Demo Credentials')).toBeInTheDocument();
    expect(screen.getByText(/ymartinez@gallo.com/)).toBeInTheDocument();
  });
});
