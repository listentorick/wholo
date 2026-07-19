import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListErrorBanner } from './ListErrorBanner';

describe('ListErrorBanner', () => {
  it('renders the given message', () => {
    render(<ListErrorBanner message="Failed to load products. Please refresh." />);
    expect(screen.getByText('Failed to load products. Please refresh.')).toBeInTheDocument();
  });
});
