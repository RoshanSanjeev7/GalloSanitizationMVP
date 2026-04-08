import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../__tests__/render-helpers';
import { makeChecklist, makeChecklistItem } from '../__tests__/factories';
import SubmissionReview from './SubmissionReview';

vi.mock('../services/api', () => ({
  default: {
    getChecklist: vi.fn(),
    updateChecklistItems: vi.fn().mockResolvedValue({ version: 2 }),
    approveChecklist: vi.fn().mockResolvedValue(undefined),
    denyChecklist: vi.fn().mockResolvedValue(undefined),
    uploadImages: vi.fn().mockResolvedValue({ images: ['img-1'] }),
    deleteImage: vi.fn().mockResolvedValue({ images: [] }),
    getImageUrl: vi.fn().mockResolvedValue('http://example.com/img.jpg'),
    getStoredUser: vi.fn().mockReturnValue({ id: 'admin-1', name: 'Admin User', email: 'admin@test.com', role: 'admin' }),
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
  status: 'submitted',
  submittedAt: '2026-04-07T00:30:00.000Z',
  endTime: '2026-04-07T00:30:00.000Z',
});

const checklistWithMixedItems = makeChecklist({
  id: 'test-cl-1',
  status: 'submitted',
  submittedAt: '2026-04-07T00:30:00.000Z',
  endTime: '2026-04-07T00:30:00.000Z',
  machines: [
    {
      name: 'Machine A',
      categories: [
        {
          name: 'Category 1',
          items: [
            makeChecklistItem({ description: 'Task 1', completed: true, completedBy: 'Operator Joe' }),
            makeChecklistItem({ description: 'Task 2', completed: false, completedBy: 'Operator Joe' }),
            makeChecklistItem({ description: 'Task 3' }),
          ],
        },
      ],
    },
  ],
});

beforeEach(() => {
  vi.mocked(api.getChecklist).mockResolvedValue(testChecklist);
  mockNavigate.mockClear();
});

afterEach(cleanup);

describe('SubmissionReview', () => {
  it('shows loading before data arrives', () => {
    // getChecklist returns a promise that never resolves during this test
    vi.mocked(api.getChecklist).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<SubmissionReview />);
    expect(screen.getByText('Loading review...')).toBeInTheDocument();
  });

  it('renders checklist items in read-only mode (no check/X buttons)', async () => {
    renderWithProviders(<SubmissionReview />);

    await waitFor(() => {
      expect(screen.getByText('Task 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Task 2')).toBeInTheDocument();

    // In read-only mode there should be no buttons with "Mark as done" or "Mark with issue" titles
    expect(screen.queryByTitle('Mark as done')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Mark with issue')).not.toBeInTheDocument();
  });

  it('shows Approve and Deny buttons', async () => {
    renderWithProviders(<SubmissionReview />);

    await waitFor(() => {
      expect(screen.getByText('Task 1')).toBeInTheDocument();
    });

    const approveButtons = screen.getAllByText('Approve');
    const denyButtons = screen.getAllByText('Deny');
    expect(approveButtons.length).toBeGreaterThanOrEqual(1);
    expect(denyButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows Edit Checklist button', async () => {
    renderWithProviders(<SubmissionReview />);

    await waitFor(() => {
      expect(screen.getByText('Task 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Edit Checklist')).toBeInTheDocument();
  });

  it('calls api.approveChecklist and navigates to /admin on Approve', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SubmissionReview />);

    await waitFor(() => {
      expect(screen.getByText('Task 1')).toBeInTheDocument();
    });

    // Click the first Approve button (top bar)
    const approveButtons = screen.getAllByText('Approve');
    await user.click(approveButtons[0]);

    await waitFor(() => {
      expect(api.approveChecklist).toHaveBeenCalledWith('test-cl-1');
    });
    expect(mockNavigate).toHaveBeenCalledWith('/admin');
  });

  it('calls api.denyChecklist and navigates to /admin on Deny', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SubmissionReview />);

    await waitFor(() => {
      expect(screen.getByText('Task 1')).toBeInTheDocument();
    });

    const denyButtons = screen.getAllByText('Deny');
    await user.click(denyButtons[0]);

    await waitFor(() => {
      expect(api.denyChecklist).toHaveBeenCalledWith('test-cl-1');
    });
    expect(mockNavigate).toHaveBeenCalledWith('/admin');
  });

  it('entering edit mode shows check/X buttons', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SubmissionReview />);

    await waitFor(() => {
      expect(screen.getByText('Task 1')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Edit Checklist'));

    await waitFor(() => {
      expect(screen.queryAllByTitle('Mark as done').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryAllByTitle('Mark with issue').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('Save Changes in edit mode calls api.updateChecklistItems', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SubmissionReview />);

    await waitFor(() => {
      expect(screen.getByText('Task 1')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Edit Checklist'));

    await waitFor(() => {
      expect(screen.getAllByText('Save Changes').length).toBeGreaterThanOrEqual(1);
    });

    const saveButtons = screen.getAllByText('Save Changes');
    await user.click(saveButtons[0]);

    await waitFor(() => {
      expect(api.updateChecklistItems).toHaveBeenCalledWith('test-cl-1', expect.any(Array), 1);
    });
  });

  it('Cancel in edit mode returns to read-only', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SubmissionReview />);

    await waitFor(() => {
      expect(screen.getByText('Task 1')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Edit Checklist'));

    await waitFor(() => {
      expect(screen.queryAllByTitle('Mark as done').length).toBeGreaterThanOrEqual(1);
    });

    const cancelButtons = screen.getAllByText('Cancel');
    await user.click(cancelButtons[0]);

    await waitFor(() => {
      expect(screen.queryByTitle('Mark as done')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Edit Checklist')).toBeInTheDocument();
  });

  it('shows summary panel with operator name and status', async () => {
    renderWithProviders(<SubmissionReview />);

    await waitFor(() => {
      expect(screen.getByText('Summary')).toBeInTheDocument();
    });

    expect(screen.getByText('Created By')).toBeInTheDocument();
    expect(screen.getByText('Test Operator')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
  });

  it('shows completion stats with Filled and Unfilled counts', async () => {
    vi.mocked(api.getChecklist).mockResolvedValue(checklistWithMixedItems);
    renderWithProviders(<SubmissionReview />);

    await waitFor(() => {
      expect(screen.getByText('Completion')).toBeInTheDocument();
    });

    // 2 filled (completed: true and completed: false both count as filled/non-null)
    // 1 unfilled (completed: null)
    const filledLabel = screen.getByText(/Filled/);
    const unfilledLabel = screen.getByText(/Unfilled/);
    expect(filledLabel).toBeInTheDocument();
    expect(unfilledLabel).toBeInTheDocument();

    // The stat values are in sibling spans
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('displays the line name and Submission Review heading', async () => {
    renderWithProviders(<SubmissionReview />);

    await waitFor(() => {
      expect(screen.getByText(/Line 91/)).toBeInTheDocument();
    });

    expect(screen.getByText(/Submission Review/)).toBeInTheDocument();
  });
});
