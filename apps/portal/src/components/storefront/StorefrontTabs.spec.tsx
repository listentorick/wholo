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
  { id: 'delivery', label: 'Delivery & terms', shortLabel: 'Delivery' },
];

function renderTabs(active = 'catalogue', onSelect = vi.fn()) {
  render(
    <StorefrontTabs slug="winos" sections={sections} activeSection={active} onSelectSection={onSelect} />,
  );
  return onSelect;
}

/** The tab <button> for a section id — its label text is split across a
 *  short/long span, so query by the section's own label. */
const tab = (label: string) => screen.getByText(label).closest('button') as HTMLElement;

describe('StorefrontTabs', () => {
  it('renders the three section tabs plus an Orders route link', () => {
    renderTabs();
    expect(tab('Catalogue')).toBeInTheDocument();
    expect(tab('About')).toBeInTheDocument();
    // long + short label both present (CSS picks one per breakpoint)
    expect(tab('Delivery & terms')).toBeInTheDocument();
    expect(screen.getByText('Delivery')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/winos/orders');
    expect(screen.queryByText('Shop')).toBeNull();
  });

  it('calls onSelectSection with the section id when a tab is clicked', () => {
    const onSelect = renderTabs('catalogue');
    fireEvent.click(tab('About'));
    expect(onSelect).toHaveBeenCalledWith('about');
  });

  it('marks the active section with the cobalt underline and no other', () => {
    renderTabs('about');
    expect(tab('About').className).toContain('border-accent');
    expect(tab('Catalogue').className).toContain('border-transparent');
  });

  it('splits the tabs evenly (flex-1) so there is no horizontal scroll on mobile', () => {
    const { container } = render(
      <StorefrontTabs slug="winos" sections={sections} activeSection="catalogue" onSelectSection={vi.fn()} />,
    );
    expect(container.firstElementChild?.className).not.toContain('overflow-x-auto');
    expect(tab('Catalogue').className).toContain('flex-1');
  });
});
