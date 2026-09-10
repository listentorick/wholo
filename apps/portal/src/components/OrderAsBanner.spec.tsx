import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockAuth: {
  orderAsMode: boolean;
  orderAsCustomerName: string | null;
  clearOrderAsSession: () => void;
};

vi.mock('@/lib/auth-context', () => ({ useAuth: () => mockAuth }));

import { OrderAsBanner } from './OrderAsBanner';

beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.style.removeProperty('--orderas-h');
  mockAuth = { orderAsMode: false, orderAsCustomerName: null, clearOrderAsSession: vi.fn() };
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
      clearOrderAsSession: vi.fn(),
    };
    render(<OrderAsBanner />);
    expect(screen.getByText('Ordering on behalf of The Roebuck Inn')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    expect(mockAuth.clearOrderAsSession).toHaveBeenCalledTimes(1);
  });

  it('is sticky at the top of the shell', () => {
    mockAuth = { orderAsMode: true, orderAsCustomerName: 'X', clearOrderAsSession: vi.fn() };
    const { container } = render(<OrderAsBanner />);
    expect((container.firstElementChild as HTMLElement).className).toContain('sticky');
  });
});
