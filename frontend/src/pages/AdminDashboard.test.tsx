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

function mockChecklistResponse(items: typeof testChecklists) {
  return { items, total: items.length, hasMore: false };
}

function renderDashboard() {
  return renderWithProviders(<AdminDashboard />, {
    preloadedState: {
      auth: { user: adminUser, loading: false, error: null },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Smart mock: filter by status param to mimic server-side filtering
  vi.mocked(api.getChecklists).mockImplementation(async (params = {}) => {
    const status = params.status;
    const search = params.search;
    const lineId = params.lineId;
    let filtered = testChecklists;
    if (status) {
      const statuses = status.split(',');
      filtered = filtered.filter((c) => statuses.includes(c.status));
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (c) => c.operatorName.toLowerCase().includes(q) || c.lineName.toLowerCase().includes(q),
      );
    }
    if (lineId) {
      filtered = filtered.filter((c) => c.lineId === lineId);
    }
    return mockChecklistResponse(filtered);
  });
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
    expect(screen.getByRole('option', { name: 'All Lines' })).toBeInTheDocument();
  });

  it('defaults to Pending tab showing submitted checklists', async () => {
    renderDashboard();
    // Wait for data to load — default tab is "submitted"
    await screen.findByText('Pending (2)');
    // Both submitted checklists should show
    expect(screen.getByText(/Gina Sanchez/)).toBeInTheDocument();
    expect(screen.getByText(/Maria Rivera/)).toBeInTheDocument();
  });

  it('shows counts on all tabs', async () => {
    renderDashboard();
    await screen.findByText('Pending (2)');
    // All tabs show their counts
    expect(screen.getByText('In Progress (1)')).toBeInTheDocument();
    expect(screen.getByText('Approved (1)')).toBeInTheDocument();
    expect(screen.getByText('All (4)')).toBeInTheDocument();
  });

  it('shows "Submitted on" timestamp for submitted checklists', async () => {
    renderDashboard();
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

  it('calls API with status param when switching tabs', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText('Pending (2)');

    // Switch to Approved tab
    await user.click(screen.getByText('Approved (1)'));

    await waitFor(() => {
      expect(api.getChecklists).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'approved' }),
      );
    });

    // Only the approved checklist should appear
    await waitFor(() => {
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

  it('sends search param to API after debounce', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText('Pending (2)');

    const searchInput = screen.getByPlaceholderText('Search operator or line...');
    await user.type(searchInput, 'Gina');

    // After debounce, API should be called with search param (second arg is AbortSignal)
    await waitFor(() => {
      expect(api.getChecklists).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Gina' }),
        expect.anything(),
      );
    });

    // Only Gina's checklist should remain
    await waitFor(() => {
      expect(screen.getByText(/Gina Sanchez/)).toBeInTheDocument();
      expect(screen.queryByText(/Maria Rivera/)).not.toBeInTheDocument();
    });
  });

  it('shows "No checklists found" when no checklists match', async () => {
    vi.mocked(api.getChecklists).mockResolvedValue({ items: [], total: 0, hasMore: false });
    renderDashboard();

    await screen.findByText('No checklists found');
  });

  it('shows notification bell with unviewed count', async () => {
    renderDashboard();
    await screen.findByText('Pending (2)');

    const bell = screen.getByLabelText('Notifications');
    expect(bell).toBeInTheDocument();

    // 2 submitted (unviewed) + 1 in_progress = 3 unviewed
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('opens notification dropdown and shows activity', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Pending (2)');

    await user.click(screen.getByLabelText('Notifications'));

    // Dropdown shows submitted + in_progress = 3 items
    await screen.findByText('Activity (3)');
    // All 3 should show "New" badge
    const newBadges = screen.getAllByText('New');
    expect(newBadges.length).toBe(3);
  });

  it('notification shows status badges', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Pending (2)');

    await user.click(screen.getByLabelText('Notifications'));
    await screen.findByText('Activity (3)');

    // Should show both "Pending Review" and "In Progress" status badges
    expect(screen.getAllByText('Pending Review').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('In Progress').length).toBeGreaterThanOrEqual(1);
  });

  it('clicking a submitted notification navigates to review page', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Pending (2)');

    await user.click(screen.getByLabelText('Notifications'));
    await screen.findByText('Activity (3)');

    // Click a submitted notification row
    const submittedRows = screen.getAllByText(/Submitted/);
    await user.click(submittedRows[0].closest('div[style]')!);

    expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/\/checklist\/.*\/review/));
  });

  it('shows Load More button when hasMore is true', async () => {
    vi.mocked(api.getChecklists).mockResolvedValueOnce({
      items: testChecklists.filter((c) => c.status === 'submitted'),
      total: 10,
      hasMore: true,
    });
    renderDashboard();

    const loadMoreBtn = await screen.findByText('Load More');
    expect(loadMoreBtn).toBeInTheDocument();
  });
});
