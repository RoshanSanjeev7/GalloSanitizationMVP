import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import StatusBadge from './StatusBadge';

afterEach(cleanup);

describe('StatusBadge', () => {
  it('renders "In Progress" for status "in_progress"', () => {
    render(<StatusBadge status="in_progress" />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders "Pending Review" for status "submitted"', () => {
    render(<StatusBadge status="submitted" />);
    expect(screen.getByText('Pending Review')).toBeInTheDocument();
  });

  it('renders "Approved" for status "approved"', () => {
    render(<StatusBadge status="approved" />);
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('renders "Denied" for status "denied"', () => {
    render(<StatusBadge status="denied" />);
    expect(screen.getByText('Denied')).toBeInTheDocument();
  });

  it('falls back to raw status string for unknown values', () => {
    render(<StatusBadge status="some_unknown_status" />);
    expect(screen.getByText('some_unknown_status')).toBeInTheDocument();
  });
});
