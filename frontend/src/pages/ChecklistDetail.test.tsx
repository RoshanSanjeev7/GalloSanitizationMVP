import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../__tests__/render-helpers';
import { makeChecklist, makeChecklistItem } from '../__tests__/factories';
import ChecklistDetail from './ChecklistDetail';

vi.mock('../services/api', () => ({
  default: {
    getChecklist: vi.fn(),
    getImageUrl: vi.fn().mockResolvedValue('http://example.com/img.jpg'),
    downloadChecklistPdf: vi.fn().mockResolvedValue(undefined),
    getStoredUser: vi.fn().mockReturnValue(null),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: 'test-cl-1' }) };
});

import api from '../services/api';

const testChecklist = makeChecklist({
  id: 'test-cl-1',
  status: 'approved',
  lineName: 'Line 91',
  endTime: '2026-04-07T01:00:00.000Z',
  machines: [
    {
      name: 'Machine A',
      categories: [
        {
          name: 'Category 1',
          items: [
            makeChecklistItem({ description: 'Task 1', completed: true, completedBy: 'Operator Joe' }),
            makeChecklistItem({ description: 'Task 2', completed: false }),
          ],
        },
      ],
    },
  ],
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

beforeEach(() => {
  vi.mocked(api.getChecklist).mockResolvedValue(testChecklist);
  mockNavigate.mockClear();
});

afterEach(cleanup);

describe('ChecklistDetail', () => {
  it('shows loading before data arrives', () => {
    vi.mocked(api.getChecklist).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ChecklistDetail />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders checklist items after loading', async () => {
    renderWithProviders(<ChecklistDetail />, { preloadedState: operatorState });

    await waitFor(() => {
      // Items appear in both main view and print section
      expect(screen.getAllByText('Task 1').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getAllByText('Task 2').length).toBeGreaterThanOrEqual(1);
  });

  it('shows line name and status', async () => {
    renderWithProviders(<ChecklistDetail />, { preloadedState: operatorState });

    await waitFor(() => {
      expect(screen.getAllByText(/Line 91/).length).toBeGreaterThanOrEqual(1);
    });

    // The heading combines line name and status: "Line 91 - Approved"
    expect(screen.getByText(/Line 91 - Approved/)).toBeInTheDocument();
  });

  it('shows PDF export button only for admin users', async () => {
    renderWithProviders(<ChecklistDetail />, { preloadedState: adminState });

    await waitFor(() => {
      expect(screen.getAllByText('Task 1').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText('Export PDF')).toBeInTheDocument();
  });

  it('does not show PDF export button for operator users', async () => {
    renderWithProviders(<ChecklistDetail />, { preloadedState: operatorState });

    await waitFor(() => {
      expect(screen.getAllByText('Task 1').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.queryByText('Export PDF')).not.toBeInTheDocument();
  });

  it('shows Back button', async () => {
    renderWithProviders(<ChecklistDetail />, { preloadedState: operatorState });

    await waitFor(() => {
      expect(screen.getAllByText('Task 1').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText(/Back/)).toBeInTheDocument();
  });
});
