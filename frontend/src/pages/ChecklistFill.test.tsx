import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChecklistFill from './ChecklistFill';
import { renderWithProviders } from '../__tests__/render-helpers';
import { makeChecklist, makeUserPublic, makeChecklistItem } from '../__tests__/factories';
import api from '../services/api';

vi.mock('../services/api', () => ({
  default: {
    getChecklist: vi.fn(),
    updateChecklistItems: vi.fn().mockResolvedValue({ version: 1 }),
    submitChecklist: vi.fn().mockResolvedValue(undefined),
    uploadImages: vi.fn().mockResolvedValue({ images: ['img-1'] }),
    deleteImage: vi.fn().mockResolvedValue({ images: [] }),
    getImageUrl: vi.fn().mockResolvedValue('http://example.com/img.jpg'),
    getStoredUser: vi.fn().mockReturnValue({ id: 'op-1', name: 'Test Operator', email: 'test@test.com', role: 'operator' }),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: 'test-cl-1' }) };
});

const operator = makeUserPublic({ id: 'op-1', name: 'Test Operator', role: 'operator' });

const preloadedState = {
  auth: { user: operator, loading: false, error: null },
};

const initialEntries = ['/checklist/test-cl-1/fill'];

function buildChecklist() {
  return makeChecklist({
    id: 'test-cl-1',
    lineName: 'Line 91',
    operatorName: 'Test Operator',
    machines: [
      {
        name: 'Filler',
        categories: [
          {
            name: 'Rinse',
            items: [
              makeChecklistItem({ description: 'Flush water lines' }),
              makeChecklistItem({ description: 'Check nozzles' }),
              makeChecklistItem({ description: 'Inspect gaskets' }),
            ],
          },
          {
            name: 'Sanitize',
            items: [
              makeChecklistItem({ description: 'Apply sanitizer' }),
            ],
          },
        ],
      },
      {
        name: 'Labeler',
        categories: [
          {
            name: 'Cleaning',
            items: [
              makeChecklistItem({ description: 'Wipe rollers' }),
            ],
          },
        ],
      },
    ],
  });
}

function renderPage() {
  return renderWithProviders(<ChecklistFill />, { preloadedState, initialEntries });
}

describe('ChecklistFill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getChecklist).mockResolvedValue(buildChecklist());
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  // 1. Loading state
  it('shows loading spinner before data arrives', () => {
    vi.mocked(api.getChecklist).mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByText('Loading checklist...')).toBeInTheDocument();
  });

  // 2. Renders checklist items after data loads
  it('renders checklist items after data loads', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Flush water lines')).toBeInTheDocument();
    });
    expect(screen.getByText('Check nozzles')).toBeInTheDocument();
    expect(screen.getByText('Inspect gaskets')).toBeInTheDocument();
  });

  // 3. Renders machine selector dropdown
  it('renders machine selector dropdown with machine names', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const options = Array.from(select.options);
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toContain('Filler');
    expect(options[1].textContent).toContain('Labeler');
  });

  // 4. Shows submit button at top and bottom
  it('shows submit button at top and bottom', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Flush water lines')).toBeInTheDocument();
    });
    const submitButtons = screen.getAllByRole('button', { name: /submit checklist/i });
    expect(submitButtons.length).toBe(2);
  });

  // 5. Click check button marks item as completed
  it('marks item as completed when check button is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Flush water lines')).toBeInTheDocument();
    });
    const checkButtons = screen.getAllByTitle('Mark as done');
    await user.click(checkButtons[0]);
    // After clicking, the category count should update from 0/3 to 1/3
    await waitFor(() => {
      expect(screen.getByText('1/3')).toBeInTheDocument();
    });
  });

  // 6. Auto-save triggers after 500ms debounce
  it('auto-saves via updateChecklistItems after 500ms debounce', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Flush water lines')).toBeInTheDocument();
    });
    const checkButtons = screen.getAllByTitle('Mark as done');
    await user.click(checkButtons[0]);

    // Should not have been called yet (debounced)
    expect(api.updateChecklistItems).not.toHaveBeenCalled();

    // 200ms is not enough — still debounced
    vi.advanceTimersByTime(200);
    expect(api.updateChecklistItems).not.toHaveBeenCalled();

    // Advance to 500ms to trigger the debounced save
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(api.updateChecklistItems).toHaveBeenCalledWith('test-cl-1', expect.any(Array), 1);
    });
  });

  it('shows save status indicator while saving', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    // Make save resolve after a delay
    let resolveSave!: (value: any) => void;
    vi.mocked(api.updateChecklistItems).mockReturnValueOnce(
      new Promise((resolve) => { resolveSave = resolve; }),
    );

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Flush water lines')).toBeInTheDocument();
    });

    const checkButtons = screen.getAllByTitle('Mark as done');
    await user.click(checkButtons[0]);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    resolveSave(buildChecklist());
    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });

  it('shows conflict message on 409 error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    const conflictError = new Error('Conflict') as Error & { status: number };
    conflictError.status = 409;
    vi.mocked(api.updateChecklistItems).mockRejectedValueOnce(conflictError);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Flush water lines')).toBeInTheDocument();
    });

    const checkButtons = screen.getAllByTitle('Mark as done');
    await user.click(checkButtons[0]);
    vi.advanceTimersByTime(500);

    await waitFor(() => {
      expect(screen.getByText(/modified by another user/i)).toBeInTheDocument();
    });
  });

  // 7. Submit button shows "Cannot Submit" when items are incomplete
  it('shows Cannot Submit with incomplete items when not all items are filled', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Flush water lines')).toBeInTheDocument();
    });
    const submitButtons = screen.getAllByRole('button', { name: /submit checklist/i });
    await user.click(submitButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Cannot Submit')).toBeInTheDocument();
    });
    expect(screen.getByText('0 out of 5 items completed.')).toBeInTheDocument();
    expect(screen.getByText(/all items must be checked/i)).toBeInTheDocument();
    // Should show "Go to" buttons to jump to incomplete items
    expect(screen.getAllByRole('button', { name: 'Go to' }).length).toBeGreaterThan(0);
  });

  // 8. Confirm submit calls api.submitChecklist when all items completed
  it('calls api.submitChecklist and navigates when all items are completed', async () => {
    // Use a single-machine checklist so all items are visible at once
    const simpleChecklist = makeChecklist({
      id: 'test-cl-1',
      lineName: 'Line 91',
      operatorName: 'Test Operator',
      version: 1,
      machines: [{
        name: 'Filler',
        categories: [{
          name: 'Rinse',
          items: [
            makeChecklistItem({ description: 'Task A', completed: true, completedBy: 'Test', completedAt: '2026-04-09T00:00:00Z' }),
            makeChecklistItem({ description: 'Task B', completed: true, completedBy: 'Test', completedAt: '2026-04-09T00:00:00Z' }),
          ],
        }],
      }],
    });
    vi.mocked(api.getChecklist).mockResolvedValue(simpleChecklist);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Task A')).toBeInTheDocument();
    });

    const submitButtons = screen.getAllByRole('button', { name: /submit checklist/i });
    await user.click(submitButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/are you sure you want to submit/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: 'Submit' });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(api.submitChecklist).toHaveBeenCalledWith('test-cl-1');
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  // 9. Category collapse/expand
  it('collapses and expands a category when its header is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Flush water lines')).toBeInTheDocument();
    });

    // Click the category header to collapse it
    const categoryHeader = screen.getByText('Rinse');
    await user.click(categoryHeader);

    // Items should be hidden
    expect(screen.queryByText('Flush water lines')).not.toBeInTheDocument();

    // Click again to expand
    await user.click(categoryHeader);

    await waitFor(() => {
      expect(screen.getByText('Flush water lines')).toBeInTheDocument();
    });
  });

  // 10. Comment toggle shows input
  it('shows comment input when "+ Add comment" is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Flush water lines')).toBeInTheDocument();
    });

    const addCommentBtns = screen.getAllByText('+ Add comment');
    await user.click(addCommentBtns[0]);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Leave a comment...')).toBeInTheDocument();
    });
    // The button text should now say "Hide comment"
    expect(screen.getByText('Hide comment')).toBeInTheDocument();
  });

  // 11. Close button in submit modal closes the modal
  it('closes the submit modal when Close is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Flush water lines')).toBeInTheDocument();
    });

    const submitButtons = screen.getAllByRole('button', { name: /submit checklist/i });
    await user.click(submitButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Cannot Submit')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(screen.queryByText('Cannot Submit')).not.toBeInTheDocument();
    });
  });

  // 12. Switching machines shows different items
  it('shows different items when switching machines via dropdown', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Flush water lines')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, '1');

    await waitFor(() => {
      expect(screen.getByText('Wipe rollers')).toBeInTheDocument();
    });
    expect(screen.queryByText('Flush water lines')).not.toBeInTheDocument();
  });

  // 13. Mark with issue button toggles
  it('marks item with issue when X button is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Flush water lines')).toBeInTheDocument();
    });

    const issueButtons = screen.getAllByTitle('Mark with issue');
    await user.click(issueButtons[0]);

    // The category count should update from 0/3 to 1/3 (item.completed is false, not null)
    await waitFor(() => {
      expect(screen.getByText('1/3')).toBeInTheDocument();
    });
  });

  // 14. Back button saves and navigates
  it('saves and navigates home when Back button is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Flush water lines')).toBeInTheDocument();
    });

    const backBtn = screen.getByText(/back/i);
    await user.click(backBtn);

    await waitFor(() => {
      expect(api.updateChecklistItems).toHaveBeenCalledWith('test-cl-1', expect.any(Array), 1);
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  // 15. Displays line name and operator info
  it('displays line name and operator name in header', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Line 91/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Test Operator/)).toBeInTheDocument();
  });
});
