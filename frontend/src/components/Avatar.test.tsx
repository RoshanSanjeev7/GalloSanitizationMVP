import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Avatar from './Avatar';

afterEach(cleanup);

describe('Avatar', () => {
  it('renders single initial for one-word name', () => {
    render(<Avatar name="Alice" />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders two initials for two-word name', () => {
    render(<Avatar name="Alice Smith" />);
    expect(screen.getByText('AS')).toBeInTheDocument();
  });

  it('truncates to 2 chars for 3-word name', () => {
    render(<Avatar name="John Paul Smith" />);
    expect(screen.getByText('JP')).toBeInTheDocument();
  });
});
