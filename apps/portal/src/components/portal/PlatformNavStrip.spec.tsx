import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PlatformNavStrip } from './PlatformNavStrip';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('PlatformNavStrip', () => {
  it('links "My Suppliers" to the account home', () => {
    render(<PlatformNavStrip distributorName="Mere Wine Co" />);
    expect(screen.getByText('My Suppliers').closest('a')).toHaveAttribute('href', '/');
  });

  it('links the distributor name in the breadcrumb to its storefront root', () => {
    render(<PlatformNavStrip slug="mere-wine-co" distributorName="Mere Wine Co" />);
    expect(screen.getByText('Mere Wine Co').closest('a')).toHaveAttribute('href', '/mere-wine-co');
  });

  it('renders the distributor name as plain text when no slug is given', () => {
    render(<PlatformNavStrip distributorName="Mere Wine Co" />);
    expect(screen.getByText('Mere Wine Co').closest('a')).toBeNull();
  });

  it('omits the breadcrumb separator when there is no distributor name', () => {
    render(<PlatformNavStrip />);
    expect(screen.queryByText('/')).toBeNull();
  });

  it('renders Discover and My Orders as inert, non-link items', () => {
    render(<PlatformNavStrip distributorName="Mere Wine Co" />);
    const discover = screen.getByText('Discover');
    const orders = screen.getByText('My Orders');
    expect(discover.closest('a')).toBeNull();
    expect(orders.closest('a')).toBeNull();
    expect(discover).toHaveAttribute('aria-disabled', 'true');
    expect(orders).toHaveAttribute('aria-disabled', 'true');
  });
});
