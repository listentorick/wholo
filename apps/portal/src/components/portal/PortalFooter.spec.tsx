import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { organisationName: 'The Roebuck Inn' } }) }));

import { PortalFooter } from './PortalFooter';

describe('PortalFooter', () => {
  it('shows the slogan', () => {
    render(<PortalFooter />);
    expect(screen.getByText(/Sell more\./)).toBeInTheDocument();
    expect(screen.getByText(/Run smoother\./)).toBeInTheDocument();
  });

  it('links the in-app destinations and leaves the rest as placeholders', () => {
    render(<PortalFooter />);
    expect(screen.getByText('My Suppliers').closest('a')).toHaveAttribute('href', '/');
    expect(screen.getByText('Settings').closest('a')).toHaveAttribute('href', '/settings');
    // placeholder links render as <a> with no href
    expect(screen.getByText('Discover').closest('a')).not.toHaveAttribute('href');
    expect(screen.getByText('Terms & conditions').closest('a')).not.toHaveAttribute('href');
  });

  it('opens help, policy and marketing-site links in a new tab', () => {
    render(<PortalFooter />);
    const cases: [string, string][] = [
      ['Help centre', 'https://help.stocdup.com'],
      ['How ordering works', 'https://help.stocdup.com/customers/place-order'],
      ['Privacy policy', 'https://www.stocdup.com/privacy'],
      ['About Stocdup', 'https://www.stocdup.com'],
    ];
    for (const [label, href] of cases) {
      const link = screen.getByText(label).closest('a');
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('drops the removed links', () => {
    render(<PortalFooter />);
    for (const label of ['Delivery addresses', 'Delivery areas', 'Minimum order', 'Payment & credit']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('shows the legal line with the acting organisation and current year', () => {
    render(<PortalFooter />);
    expect(screen.getByText(`© ${new Date().getFullYear()} Stocdup`)).toBeInTheDocument();
    expect(screen.getByText(/The Roebuck Inn · United Kingdom \(GBP £\)/)).toBeInTheDocument();
  });

  it('sits on the Pale Stone ground', () => {
    const { container } = render(<PortalFooter />);
    expect(container.querySelector('footer')?.className).toContain('bg-canvas');
  });
});
