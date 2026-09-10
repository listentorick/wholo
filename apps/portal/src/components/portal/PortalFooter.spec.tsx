import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { PortalFooter } from './PortalFooter';

describe('PortalFooter', () => {
  it('renders the wordmark and the two working links', () => {
    const { container } = render(<PortalFooter />);
    expect(container.querySelector('img[src="/logos/stocdup-logo-only.png"]')).toBeInTheDocument();
    expect(screen.getByText('My Suppliers').closest('a')).toHaveAttribute('href', '/');
    expect(screen.getByText('Settings').closest('a')).toHaveAttribute('href', '/settings');
  });

  it('shows the current-year legal line', () => {
    render(<PortalFooter />);
    expect(screen.getByText(`© ${new Date().getFullYear()} Stocdup`)).toBeInTheDocument();
  });
});
