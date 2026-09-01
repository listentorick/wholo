import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Eyebrow } from './Eyebrow';

describe('Eyebrow', () => {
  it('renders its label text', () => {
    render(<Eyebrow>Your wholesalers</Eyebrow>);
    expect(screen.getByText('Your wholesalers')).toBeInTheDocument();
  });

  it('is uppercase, bold and wide-tracked', () => {
    render(<Eyebrow>Discover</Eyebrow>);
    const el = screen.getByText('Discover');
    expect(el).toHaveClass('uppercase', 'font-bold', 'tracking-[0.14em]');
  });

  it('merges a custom className', () => {
    render(<Eyebrow className="mb-4">Discover</Eyebrow>);
    expect(screen.getByText('Discover')).toHaveClass('mb-4');
  });

  it('marks the amber dash as decorative', () => {
    const { container } = render(<Eyebrow>Suppliers</Eyebrow>);
    const dash = container.querySelector('[aria-hidden="true"]');
    expect(dash).toBeInTheDocument();
    expect(dash).toHaveClass('bg-amber');
  });
});
