import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OrderAsEndedPage from './page';

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

let mockDistributor: { name: string } | null = null;
vi.mock('@/lib/distributor-context', () => ({
  useDistributor: () => ({ distributor: mockDistributor }),
}));

describe('OrderAsEndedPage', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockDistributor = { name: 'Mere Wine Co' };
  });

  it('shows the customer name and distributor name in the confirmation copy', () => {
    mockSearchParams = new URLSearchParams({ customer: 'The Roebuck Inn' });
    render(<OrderAsEndedPage />);

    expect(screen.getByRole('heading').textContent).toBe(
      'You’ve ended your “Order on behalf of The Roebuck Inn” session',
    );
    expect(
      screen.getByText('Any orders you placed will appear in the Stocdup Admin console for Mere Wine Co.'),
    ).toBeInTheDocument();
  });

  it('falls back to generic labels when no customer or distributor is present', () => {
    mockDistributor = null;
    render(<OrderAsEndedPage />);

    expect(screen.getByRole('heading').textContent).toBe(
      'You’ve ended your “Order on behalf of the customer” session',
    );
    expect(
      screen.getByText('Any orders you placed will appear in the Stocdup Admin console for your distributor.'),
    ).toBeInTheDocument();
  });

  it('close-tab button calls window.close', () => {
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
    render(<OrderAsEndedPage />);

    fireEvent.click(screen.getByText('Close this tab'));

    expect(closeSpy).toHaveBeenCalledTimes(1);
    closeSpy.mockRestore();
  });
});
