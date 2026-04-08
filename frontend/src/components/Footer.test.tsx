import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../__tests__/render-helpers';
import Footer from './Footer';

afterEach(cleanup);

describe('Footer', () => {
  it('renders Settings link for operator', () => {
    renderWithProviders(<Footer role="operator" onAddChecklist={vi.fn()} />);
    const settingsLink = screen.getByRole('link', { name: /settings/i });
    expect(settingsLink).toBeInTheDocument();
  });

  it('renders "+ Add Checklist" button for operator role', () => {
    renderWithProviders(<Footer role="operator" onAddChecklist={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add checklist/i })).toBeInTheDocument();
  });

  it('calls onAddChecklist when "+ Add Checklist" clicked', async () => {
    const user = userEvent.setup();
    const onAddChecklist = vi.fn();
    renderWithProviders(<Footer role="operator" onAddChecklist={onAddChecklist} />);
    await user.click(screen.getByRole('button', { name: /add checklist/i }));
    expect(onAddChecklist).toHaveBeenCalledTimes(1);
  });

  it('renders "Edit Templates" link for admin role', () => {
    renderWithProviders(<Footer role="admin" />);
    const editLink = screen.getByRole('link', { name: /edit templates/i });
    expect(editLink).toBeInTheDocument();
  });

  it('renders "Log Out" button', () => {
    renderWithProviders(<Footer role="operator" onAddChecklist={vi.fn()} />);
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });
});
