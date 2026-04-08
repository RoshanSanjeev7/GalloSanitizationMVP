import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal';

afterEach(cleanup);

describe('Modal', () => {
  it('renders children content', () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <p>Test content</p>
      </Modal>
    );
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('calls onClose when clicking the overlay', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <Modal onClose={onClose}>
        <p>Test content</p>
      </Modal>
    );
    // The overlay is the outermost div
    const overlay = container.firstChild as HTMLElement;
    await user.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when clicking inside the modal content', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <p>Test content</p>
      </Modal>
    );
    await user.click(screen.getByText('Test content'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
