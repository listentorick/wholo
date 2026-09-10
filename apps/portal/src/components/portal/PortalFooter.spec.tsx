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

  it('links the two real destinations and leaves the rest as placeholders', () => {
    render(<PortalFooter />);
    expect(screen.getByText('My Suppliers').closest('a')).toHaveAttribute('href', '/');
    expect(screen.getByText('Settings').closest('a')).toHaveAttribute('href', '/settings');
    // placeholder links render as <a> with no href
    expect(screen.getByText('Discover').closest('a')).not.toHaveAttribute('href');
    expect(screen.getByText('Help centre').closest('a')).not.toHaveAttribute('href');
    expect(screen.getByText('Privacy policy')).toBeInTheDocument();
    expect(screen.getByText('Terms & conditions')).toBeInTheDocument();
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
