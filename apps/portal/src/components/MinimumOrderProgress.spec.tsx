import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MinimumOrderProgress } from './MinimumOrderProgress';

describe('MinimumOrderProgress', () => {
  it('renders nothing when minimum is null', () => {
    const { container } = render(<MinimumOrderProgress subtotal={50} minimum={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when minimum is £0 (treated as no minimum)', () => {
    const { container } = render(<MinimumOrderProgress subtotal={0} minimum={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the "met" confirmation when subtotal >= minimum, with no progress bar', () => {
    render(<MinimumOrderProgress subtotal={120} minimum={100} />);
    expect(screen.getByText('Minimum order value met')).toBeTruthy();
    expect(screen.queryByText(/more to reach/)).toBeNull();
  });

  it('shows the progress bar and remaining-amount copy when subtotal < minimum', () => {
    render(<MinimumOrderProgress subtotal={30} minimum={100} />);
    expect(screen.getByText('Add £70.00 more to reach the £100.00 minimum order')).toBeTruthy();
  });

  it('caps the bar fill at 100% and does not divide by zero when minimum is £0', () => {
    const { container } = render(<MinimumOrderProgress subtotal={30} minimum={100} />);
    const fill = container.querySelector('.bg-amber') as HTMLElement;
    expect(fill.style.width).toBe('30%');
  });

  it('renders the prominent-size copy variant on checkout', () => {
    render(<MinimumOrderProgress subtotal={100} minimum={100} size="prominent" />);
    expect(screen.getByText("You've met the £100.00 minimum order value")).toBeTruthy();
  });
});
