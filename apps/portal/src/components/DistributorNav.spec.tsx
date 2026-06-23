import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DistributorNav } from './DistributorNav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/winos',
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('DistributorNav', () => {
  it('renders all four tab labels', () => {
    render(<DistributorNav distributorSlug="winos" />);
    expect(screen.getByText('About')).toBeDefined();
    expect(screen.getByText('Shop')).toBeDefined();
    expect(screen.getByText('Orders')).toBeDefined();
    expect(screen.getByText('Favourites')).toBeDefined();
  });

  it('links to the correct hrefs', () => {
    render(<DistributorNav distributorSlug="winos" />);
    expect(screen.getByText('About').closest('a')?.getAttribute('href')).toBe('/winos');
    expect(screen.getByText('Shop').closest('a')?.getAttribute('href')).toBe('/winos/products');
    expect(screen.getByText('Orders').closest('a')?.getAttribute('href')).toBe('/winos/orders');
    expect(screen.getByText('Favourites').closest('a')?.getAttribute('href')).toBe('/winos/favourites');
  });

  it('marks About as active when on the root slug path', () => {
    render(<DistributorNav distributorSlug="winos" />);
    const aboutLink = screen.getByText('About').closest('a');
    expect(aboutLink?.className).toContain('border-[#D97036]');
  });

  it('marks inactive tabs with transparent border', () => {
    render(<DistributorNav distributorSlug="winos" />);
    const shopLink = screen.getByText('Shop').closest('a');
    expect(shopLink?.className).toContain('border-transparent');
  });
});
