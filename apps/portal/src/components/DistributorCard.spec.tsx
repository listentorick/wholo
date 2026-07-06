import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DistributorCard } from './DistributorCard';
import type { PortalDistributorSummary } from '@wholo/types';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const baseDistributor: PortalDistributorSummary = {
  id: 'dist-1',
  name: 'Winos',
  slug: 'winos',
  logoUrl: null,
  email: 'orders@winos.com',
  phone: '+61 2 9000 0000',
  orderCount: 14,
  minimumOrderSpend: null,
};

describe('DistributorCard', () => {
  it('renders distributor name', () => {
    render(<DistributorCard distributor={baseDistributor} />);
    expect(screen.getByText('Winos')).toBeTruthy();
  });

  it('renders email and phone', () => {
    render(<DistributorCard distributor={baseDistributor} />);
    expect(screen.getByText('orders@winos.com')).toBeTruthy();
    expect(screen.getByText('+61 2 9000 0000')).toBeTruthy();
  });

  it('renders order count', () => {
    render(<DistributorCard distributor={baseDistributor} />);
    expect(screen.getByText('14')).toBeTruthy();
    expect(screen.getByText('orders')).toBeTruthy();
  });

  it('navigates to distributor slug on click', () => {
    render(<DistributorCard distributor={baseDistributor} />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockPush).toHaveBeenCalledWith('/winos');
  });

  it('shows initials avatar when no logoUrl', () => {
    render(<DistributorCard distributor={{ ...baseDistributor, logoUrl: null }} />);
    expect(screen.getByText('W')).toBeTruthy();
  });

  it('shows logo img when logoUrl is provided', () => {
    const { container } = render(
      <DistributorCard distributor={{ ...baseDistributor, logoUrl: 'https://cdn.example.com/logo.jpg' }} />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/logo.jpg');
  });

  it('does not render email when absent', () => {
    render(<DistributorCard distributor={{ ...baseDistributor, email: null }} />);
    expect(screen.queryByText('orders@winos.com')).toBeNull();
  });

  it('does not render phone when absent', () => {
    render(<DistributorCard distributor={{ ...baseDistributor, phone: null }} />);
    expect(screen.queryByText('+61 2 9000 0000')).toBeNull();
  });

  describe('locked state', () => {
    it('does not render a button when locked', () => {
      render(<DistributorCard distributor={baseDistributor} locked />);
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('does not navigate when the locked card is clicked', () => {
      mockPush.mockClear();
      const { container } = render(<DistributorCard distributor={baseDistributor} locked />);
      fireEvent.click(container.firstChild as Element);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('still renders distributor name when locked', () => {
      render(<DistributorCard distributor={baseDistributor} locked />);
      expect(screen.getByText('Winos')).toBeTruthy();
    });
  });
});
