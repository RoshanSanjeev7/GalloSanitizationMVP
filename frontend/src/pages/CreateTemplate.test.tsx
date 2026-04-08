import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../__tests__/render-helpers';
import { makeLine } from '../__tests__/factories';
import CreateTemplate from './CreateTemplate';

vi.mock('../services/api', () => ({
  default: {
    getLines: vi.fn(),
    getTemplates: vi.fn(),
    createTemplate: vi.fn().mockResolvedValue({ id: 'tpl-1', title: 'Test', lineId: 'line-1', machines: [] }),
    updateTemplate: vi.fn().mockResolvedValue({ id: 'tpl-1', title: 'Test', lineId: 'line-1', machines: [] }),
    getStoredUser: vi.fn().mockReturnValue(null),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import api from '../services/api';

const testLines = [
  makeLine({ id: 'line-1', name: 'Line 91' }),
  makeLine({ id: 'line-2', name: 'Line 93' }),
];

const adminState = {
  auth: {
    user: { id: 'admin-1', name: 'Admin User', email: 'admin@test.com', role: 'admin' as const },
    loading: false,
    error: null,
  },
};

beforeEach(() => {
  vi.mocked(api.getLines).mockResolvedValue(testLines);
  vi.mocked(api.getTemplates).mockResolvedValue([]);
  mockNavigate.mockClear();
});

afterEach(cleanup);

describe('CreateTemplate', () => {
  it('renders form with line selector', async () => {
    renderWithProviders(<CreateTemplate />, { preloadedState: adminState });

    await waitFor(() => {
      expect(screen.getByText('Select a Line')).toBeInTheDocument();
    });

    expect(screen.getByText('Choose a line...')).toBeInTheDocument();
  });

  it('loads lines on mount', async () => {
    renderWithProviders(<CreateTemplate />, { preloadedState: adminState });

    await waitFor(() => {
      expect(api.getLines).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText(/Line 91/)).toBeInTheDocument();
    });

    expect(screen.getByText(/Line 93/)).toBeInTheDocument();
  });

  it('shows template form after selecting a line', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTemplate />, { preloadedState: adminState });

    await waitFor(() => {
      expect(screen.getByText(/Line 91/)).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'line-1');

    expect(screen.getByPlaceholderText(/Weekly Deep Clean/)).toBeInTheDocument();
    expect(screen.getByText('Machines')).toBeInTheDocument();
  });

  it('Add Machine button adds a machine tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTemplate />, { preloadedState: adminState });

    await waitFor(() => {
      expect(screen.getByText(/Line 91/)).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'line-1');

    await user.click(screen.getByText('+ Add Machine'));
    expect(screen.getByText('Machine 2')).toBeInTheDocument();
  });

  it('Create button disabled when title is empty', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTemplate />, { preloadedState: adminState });

    await waitFor(() => {
      expect(screen.getByText(/Line 91/)).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'line-1');

    const createButtons = screen.getAllByText('Create Template');
    expect(createButtons[0]).toBeDisabled();
  });

  it('Create button enabled when all fields are filled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTemplate />, { preloadedState: adminState });

    await waitFor(() => {
      expect(screen.getByText(/Line 91/)).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'line-1');

    await user.type(screen.getByPlaceholderText(/Weekly Deep Clean/), 'My Template');
    await user.type(screen.getByPlaceholderText('e.g. Filler'), 'Test Machine');
    await user.type(screen.getByPlaceholderText('e.g. Prep'), 'Test Category');
    await user.type(screen.getByPlaceholderText('Enter task description...'), 'Test Task');

    const createButtons = screen.getAllByText('Create Template');
    expect(createButtons[0]).not.toBeDisabled();
  });

  it('Create button disabled when machine name is empty', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTemplate />, { preloadedState: adminState });

    await waitFor(() => {
      expect(screen.getByText(/Line 91/)).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'line-1');

    // Fill title only — machine/category/task are empty
    await user.type(screen.getByPlaceholderText(/Weekly Deep Clean/), 'My Template');

    const createButtons = screen.getAllByText('Create Template');
    expect(createButtons[0]).toBeDisabled();
  });
});
