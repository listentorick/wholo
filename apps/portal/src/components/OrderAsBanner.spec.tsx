import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockAuth: {
  orderAsMode: boolean;
  orderAsCustomerName: string | null;
  endOrderAsSession: () => Promise<void>;
};

vi.mock('@/lib/auth-context', () => ({ useAuth: () => mockAuth }));

import { OrderAsBanner } from './OrderAsBanner';

beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.style.removeProperty('--orderas-h');
  mockAuth = { orderAsMode: false, orderAsCustomerName: null, endOrderAsSession: vi.fn().mockResolvedValue(undefined) };
});

describe('OrderAsBanner', () => {
  it('renders nothing and zeroes --orderas-h when not impersonating', () => {
    const { container } = render(<OrderAsBanner />);
    expect(container.firstChild).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--orderas-h')).toBe('0px');
  });

  it('shows the customer name and ends the session on click', () => {
    mockAuth = {
      orderAsMode: true,
      orderAsCustomerName: 'The Roebuck Inn',
      endOrderAsSession: vi.fn().mockResolvedValue(undefined),
    };
    render(<OrderAsBanner />);
    expect(screen.getByText('Ordering on behalf of The Roebuck Inn')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    expect(mockAuth.endOrderAsSession).toHaveBeenCalledTimes(1);
  });

  it('disables the button once ending is in flight', () => {
    mockAuth = { orderAsMode: true, orderAsCustomerName: 'X', endOrderAsSession: vi.fn().mockResolvedValue(undefined) };
    render(<OrderAsBanner />);
    const button = screen.getByRole('button', { name: /end session/i });
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: /ending/i })).toBeDisabled();
  });

  it('re-enables the button if endOrderAsSession rejects, instead of staying stuck disabled', async () => {
    mockAuth = {
      orderAsMode: true,
      orderAsCustomerName: 'X',
      endOrderAsSession: vi.fn().mockRejectedValue(new Error('boom')),
    };
    render(<OrderAsBanner />);
    fireEvent.click(screen.getByRole('button', { name: /end session/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /end session/i })).not.toBeDisabled();
    });
  });

  it('is sticky at the top of the shell', () => {
    mockAuth = { orderAsMode: true, orderAsCustomerName: 'X', endOrderAsSession: vi.fn().mockResolvedValue(undefined) };
    const { container } = render(<OrderAsBanner />);
    expect((container.firstElementChild as HTMLElement).className).toContain('sticky');
  });
});
