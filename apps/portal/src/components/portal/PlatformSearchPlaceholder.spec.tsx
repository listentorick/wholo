import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PlatformSearchPlaceholder } from './PlatformSearchPlaceholder';

describe('PlatformSearchPlaceholder', () => {
  it('renders as an inert div, never an input', () => {
    const { container } = render(<PlatformSearchPlaceholder />);
    expect(container.querySelector('input')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows the placeholder copy and is aria-hidden', () => {
    const { container } = render(<PlatformSearchPlaceholder />);
    expect(screen.getByText(/Search Stocdup/)).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
