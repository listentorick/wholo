import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { StorefrontTabs } from './StorefrontTabs';

const sections = [
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'about', label: 'About' },
  { id: 'delivery', label: 'Delivery & terms' },
];

function renderTabs(active = 'catalogue', onSelect = vi.fn()) {
  render(
    <StorefrontTabs slug="winos" sections={sections} activeSection={active} onSelectSection={onSelect} />,
  );
  return onSelect;
}

describe('StorefrontTabs', () => {
  it('renders the three section tabs plus an Orders route link', () => {
    renderTabs();
    expect(screen.getByRole('button', { name: 'Catalogue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delivery & terms' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/winos/orders');
    expect(screen.queryByText('Shop')).toBeNull();
  });

  it('calls onSelectSection with the section id when a tab is clicked', () => {
    const onSelect = renderTabs('catalogue');
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(onSelect).toHaveBeenCalledWith('about');
  });

  it('marks the active section with the cobalt underline and no other', () => {
    renderTabs('about');
    expect(screen.getByRole('button', { name: 'About' }).className).toContain('border-accent');
    expect(screen.getByRole('button', { name: 'Catalogue' }).className).toContain('border-transparent');
  });
});
