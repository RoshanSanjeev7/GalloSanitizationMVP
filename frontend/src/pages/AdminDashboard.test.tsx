import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../__tests__/render-helpers';
import { makeChecklist, makeLine, makeUserPublic } from '../__tests__/factories';
import AdminDashboard from './AdminDashboard';

vi.mock('../services/api', () => ({
  default: {
    getChecklists: vi.fn(),
    getLines: vi.fn(),
    deleteChecklist: vi.fn(),
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

const adminUser = makeUserPublic({ name: 'Yolanda Martinez', role: 'admin' });

const testLines = [
  makeLine({ id: 'line-91', name: 'Line 91' }),
  makeLine({ id: 'line-93', name: 'Line 93' }),
];

const testChecklists = [
  makeChecklist({
    id: 'cl-submitted-1',
    status: 'submitted',
    lineName: 'Line 91',
    lineId: 'line-91',
    operatorName: 'Gina Sanchez',
    submittedAt: '2026-04-06T14:30:00.000Z',
  }),
  makeChecklist({
    id: 'cl-submitted-2',
    status: 'submitted',
    lineName: 'Line 93',
    lineId: 'line-93',
    operatorName: 'Maria Rivera',
    submittedAt: '2026-04-05T09:00:00.000Z',
  }),
  makeChecklist({
    id: 'cl-in-progress',
    status: 'in_progress',
    lineName: 'Line 91',
    lineId: 'line-91',
    operatorName: 'Gina Sanchez',
    updatedAt: '2026-04-06T16:00:00.000Z',
  }),
  makeChecklist({
    id: 'cl-approved',
    status: 'approved',
    lineName: 'Line 93',
    lineId: 'line-93',
    operatorName: 'Maria Rivera',
    endTime: '2026-04-04T12:00:00.000Z',
  }),
];

function renderDashboard() {
  return renderWithProviders(<AdminDashboard />, {
    preloadedState: {
      auth: { user: adminUser, loading: false, error: null },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getChecklists).mockResolvedValue(testChecklists);
  vi.mocked(api.getLines).mockResolvedValue(testLines);
});

describe('AdminDashboard', () => {
  it('redirects to /login when no user is in state', () => {
    renderWithProviders(<AdminDashboard />, {
      preloadedState: {
        auth: { user: null, loading: false, error: null },
      },
    });
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('renders the Sanitation Audit Log heading', () => {
    renderDashboard();
    expect(screen.getByText('Sanitation Audit Log')).toBeInTheDocument();
  });

  it('renders search input, line filter, and sort dropdown', async () => {
    renderDashboard();
    expect(screen.getByPlaceholderText('Search operator or line...')).toBeInTheDocument();
    // Line filter dropdown has "All Lines" option
    expect(screen.getByRole('option', { name: 'All Lines' })).toBeInTheDocument();
  });

  it('defaults to Pending tab showing submitted checklists', async () => {
    renderDashboard();
    // Wait for data to load
    await screen.findByText('Pending (2)');
    // Both submitted checklists should show (operator names inside sub-rows)
    expect(screen.getByText(/Gina Sanchez/)).toBeInTheDocument();
    expect(screen.getByText(/Maria Rivera/)).toBeInTheDocument();
  });

  it('renders tab buttons with correct counts', async () => {
    renderDashboard();
    await screen.findByText('Pending (2)');
    expect(screen.getByText('In Progress (1)')).toBeInTheDocument();
    expect(screen.getByText('Approved (1)')).toBeInTheDocument();
    expect(screen.getByText('All (4)')).toBeInTheDocument();
  });

  it('shows "Submitted on" timestamp for submitted checklists', async () => {
    renderDashboard();
    // Wait for submitted checklists to render on the default Pending tab
    const submittedText = await screen.findAllByText(/Submitted on/);
    expect(submittedText.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Created" timestamp for in_progress checklists', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText('Pending (2)');
    await user.click(screen.getByText('In Progress (1)'));

    const createdText = await screen.findByText(/Created/);
    expect(createdText).toBeInTheDocument();
  });

  it('filters checklists when switching tabs', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText('Pending (2)');

    // Switch to Approved tab
    await user.click(screen.getByText('Approved (1)'));
    // Only the approved checklist should appear
    await waitFor(() => {
      expect(screen.queryByText(/Gina Sanchez/)).not.toBeInTheDocument();
      expect(screen.getByText(/Maria Rivera/)).toBeInTheDocument();
    });
  });

  it('navigates to /checklist/:id/review for submitted checklists', async () => {
    const user = userEvent.setup();
    renderDashboard();

    // Default tab is Pending (submitted); find the row line name (not the <option>)
    const matches = await screen.findAllByText('Line 91');
    const rowLine = matches.find((el) => el.tagName !== 'OPTION')!;
    await user.click(rowLine.closest('[class]')!);

    expect(mockNavigate).toHaveBeenCalledWith('/checklist/cl-submitted-1/review');
  });

  it('navigates to /checklist/:id for non-submitted checklists', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText('Pending (2)');
    await user.click(screen.getByText('Approved (1)'));

    // Find the row line name, not the filter <option>
    const matches = await screen.findAllByText('Line 93');
    const rowLine = matches.find((el) => el.tagName !== 'OPTION')!;
    await user.click(rowLine.closest('[class]')!);

    expect(mockNavigate).toHaveBeenCalledWith('/checklist/cl-approved');
  });

  it('filters by search text matching operator name', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText('Pending (2)');

    const searchInput = screen.getByPlaceholderText('Search operator or line...');
    await user.type(searchInput, 'Gina');

    // Only Gina's checklist should remain visible on the pending tab
    await waitFor(() => {
      expect(screen.getByText(/Gina Sanchez/)).toBeInTheDocument();
      expect(screen.queryByText(/Maria Rivera/)).not.toBeInTheDocument();
    });
  });

  it('shows "No checklists found" when no checklists match', async () => {
    vi.mocked(api.getChecklists).mockResolvedValue([]);
    renderDashboard();

    await screen.findByText('No checklists found');
  });
});
