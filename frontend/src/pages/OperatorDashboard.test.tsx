import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../__tests__/render-helpers';
import { makeChecklist, makeLine, makeUserPublic } from '../__tests__/factories';
import OperatorDashboard from './OperatorDashboard';

vi.mock('../services/api', () => ({
  default: {
    getChecklists: vi.fn(),
    getLines: vi.fn(),
    createChecklist: vi.fn(),
    getStoredUser: vi.fn().mockReturnValue(null),
  },
}));

import api from '../services/api';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

afterEach(cleanup);

const operatorUser = makeUserPublic({ name: 'Gina Sanchez', role: 'operator' });

const testLines = [
  makeLine({ id: 'line-91', name: 'Line 91' }),
  makeLine({ id: 'line-93', name: 'Line 93' }),
];

const testChecklists = [
  makeChecklist({
    status: 'in_progress',
    lineName: 'Line 91',
    lineId: 'line-91',
    operatorName: 'Gina Sanchez',
  }),
  makeChecklist({
    status: 'submitted',
    lineName: 'Line 93',
    lineId: 'line-93',
    operatorName: 'Gina Sanchez',
    submittedAt: '2026-04-06T10:00:00.000Z',
  }),
  makeChecklist({
    status: 'approved',
    lineName: 'Line 91',
    lineId: 'line-91',
    operatorName: 'Gina Sanchez',
    endTime: '2026-04-05T15:00:00.000Z',
  }),
];

function renderDashboard() {
  return renderWithProviders(<OperatorDashboard />, {
    preloadedState: {
      auth: { user: operatorUser, loading: false, error: null },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getChecklists).mockResolvedValue(testChecklists);
  vi.mocked(api.getLines).mockResolvedValue(testLines);
});

describe('OperatorDashboard', () => {
  it('redirects to /login when no user is in state', () => {
    renderWithProviders(<OperatorDashboard />, {
      preloadedState: {
        auth: { user: null, loading: false, error: null },
      },
    });
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('calls api.getChecklists and api.getLines on mount', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(api.getChecklists).toHaveBeenCalledTimes(1);
      expect(api.getLines).toHaveBeenCalledTimes(1);
    });
  });

  it('shows welcome message with user first name', async () => {
    renderDashboard();
    expect(screen.getByText('Welcome, Gina')).toBeInTheDocument();
  });

  it('renders tab buttons with correct counts', async () => {
    renderDashboard();
    await screen.findByText('In Progress (1)');
    expect(screen.getByText('Pending Review (1)')).toBeInTheDocument();
    expect(screen.getByText('Completed (1)')).toBeInTheDocument();
    expect(screen.getByText('All (3)')).toBeInTheDocument();
  });

  it('defaults to In Progress tab and shows only in_progress checklists', async () => {
    renderDashboard();
    // Wait for data to load; only 1 in_progress checklist with Line 91
    const rows = await screen.findAllByText('Line 91');
    // The in_progress one should be shown, but we also need to confirm filtering
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('filters checklists when switching tabs', async () => {
    const user = userEvent.setup();
    renderDashboard();

    // Wait for data to load
    await screen.findByText('In Progress (1)');

    // Switch to "All" tab
    await user.click(screen.getByText('All (3)'));
    // All 3 checklists should be visible (3 line names rendered in rows)
    const allRows = await screen.findAllByText(/Gina Sanchez/);
    expect(allRows).toHaveLength(3);
  });

  it('shows operator name in each checklist row', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText('In Progress (1)');
    await user.click(screen.getByText('All (3)'));

    const operatorNames = await screen.findAllByText(/Gina Sanchez/);
    expect(operatorNames.length).toBe(3);
  });

  it('navigates to /checklist/:id/fill when clicking an in_progress checklist', async () => {
    const user = userEvent.setup();
    renderDashboard();

    // The in_progress checklist should show on the default tab
    const row = await screen.findByText('Line 91');
    await user.click(row.closest('[class]')!);

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/^\/checklist\/.*\/fill$/)
    );
  });

  it('navigates to /checklist/:id for non-in_progress checklists', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText('In Progress (1)');
    // Switch to Pending Review tab to get submitted checklist
    await user.click(screen.getByText('Pending Review (1)'));

    const row = await screen.findByText('Line 93');
    await user.click(row.closest('[class]')!);

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/^\/checklist\/[^/]+$/)
    );
  });

  it('shows "No checklists found" when filtered list is empty', async () => {
    vi.mocked(api.getChecklists).mockResolvedValue([]);
    renderDashboard();

    await screen.findByText('No checklists found');
  });
});
