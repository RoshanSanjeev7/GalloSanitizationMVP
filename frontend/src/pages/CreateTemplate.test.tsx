import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../__tests__/render-helpers';
import { makeLine } from '../__tests__/factories';
import CreateTemplate from './CreateTemplate';

vi.mock('../services/api', () => ({
  default: {
    getLines: vi.fn(),
    createTemplate: vi.fn().mockResolvedValue({ id: 'tpl-1', title: 'Test', lineId: 'line-1', machines: [] }),
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
  mockNavigate.mockClear();
});

afterEach(cleanup);

describe('CreateTemplate', () => {
  it('renders form with title input and line selector', async () => {
    renderWithProviders(<CreateTemplate />, { preloadedState: adminState });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Deep Clean Checklist')).toBeInTheDocument();
    });

    expect(screen.getByText('Template Title')).toBeInTheDocument();
    expect(screen.getByText('Assign to Line')).toBeInTheDocument();
    expect(screen.getByText('Select a line...')).toBeInTheDocument();
  });

  it('loads lines on mount', async () => {
    renderWithProviders(<CreateTemplate />, { preloadedState: adminState });

    await waitFor(() => {
      expect(api.getLines).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('Line 91')).toBeInTheDocument();
    });

    expect(screen.getByText('Line 93')).toBeInTheDocument();
  });

  it('Add Machine button adds a machine tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTemplate />, { preloadedState: adminState });

    await waitFor(() => {
      expect(screen.getByText('Machine 1')).toBeInTheDocument();
    });

    await user.click(screen.getByText('+ Add Machine'));

    expect(screen.getByText('Machine 2')).toBeInTheDocument();
  });

  it('Create button disabled when title is empty', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTemplate />, { preloadedState: adminState });

    await waitFor(() => {
      expect(screen.getByText('Line 91')).toBeInTheDocument();
    });

    // Select a line but leave title empty
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'line-1');

    const createButton = screen.getByText('Create Template');
    expect(createButton).toBeDisabled();
  });

  it('Create button disabled when no line selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTemplate />, { preloadedState: adminState });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Deep Clean Checklist')).toBeInTheDocument();
    });

    // Set title but leave line unselected
    await user.type(screen.getByPlaceholderText('Deep Clean Checklist'), 'My Template');

    const createButton = screen.getByText('Create Template');
    expect(createButton).toBeDisabled();
  });

  it('Create button enabled when both title and line are set', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTemplate />, { preloadedState: adminState });

    await waitFor(() => {
      expect(screen.getByText('Line 91')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Deep Clean Checklist'), 'My Template');
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'line-1');

    const createButton = screen.getByText('Create Template');
    expect(createButton).not.toBeDisabled();
  });
});
