import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { StorefrontTabs, STOREFRONT_SECTIONS } from './StorefrontTabs';

function renderSpy(active = 'catalogue', onSelect = vi.fn()) {
  render(
    <StorefrontTabs
      slug="winos"
      sections={STOREFRONT_SECTIONS}
      tabs={{ mode: 'spy', activeSection: active, onSelectSection: onSelect }}
    />,
  );
  return onSelect;
}

/** The tab element for a section — its label text is split across a
 *  short/long span, so query by the section's own label. */
const tab = (label: string) => screen.getByText(label).closest('button, a') as HTMLElement;

describe('StorefrontTabs — spy mode', () => {
  it('renders the three section buttons plus an Orders route link', () => {
    renderSpy();
    expect(tab('Catalogue').tagName).toBe('BUTTON');
    expect(tab('About').tagName).toBe('BUTTON');
    expect(tab('Delivery & terms').tagName).toBe('BUTTON');
    expect(screen.getByText('Delivery')).toBeInTheDocument(); // short label
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/winos/orders');
    expect(screen.queryByText('Shop')).toBeNull();
  });

  it('calls onSelectSection with the section id when a tab is clicked', () => {
    const onSelect = renderSpy('catalogue');
    fireEvent.click(tab('About'));
    expect(onSelect).toHaveBeenCalledWith('about');
  });

  it('marks the active section with the cobalt underline and no other', () => {
    renderSpy('about');
    expect(tab('About').className).toContain('border-accent');
    expect(tab('Catalogue').className).toContain('border-transparent');
  });

  it('splits the tabs evenly (flex-1) so there is no horizontal scroll on mobile', () => {
    const { container } = render(
      <StorefrontTabs
        slug="winos"
        sections={STOREFRONT_SECTIONS}
        tabs={{ mode: 'spy', activeSection: 'catalogue', onSelectSection: vi.fn() }}
      />,
    );
    expect(container.firstElementChild?.className).not.toContain('overflow-x-auto');
    expect(tab('Catalogue').className).toContain('flex-1');
  });
});

describe('StorefrontTabs — link mode', () => {
  it('renders the section tabs as links back to /{slug}#{id}', () => {
    render(<StorefrontTabs slug="winos" sections={STOREFRONT_SECTIONS} tabs={{ mode: 'link' }} />);
    expect(tab('Catalogue').tagName).toBe('A');
    expect(tab('Catalogue')).toHaveAttribute('href', '/winos#catalogue');
    expect(tab('About')).toHaveAttribute('href', '/winos#about');
    expect(tab('Delivery & terms')).toHaveAttribute('href', '/winos#delivery');
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/winos/orders');
  });

  it('has no active tab when no activeSection is given', () => {
    render(<StorefrontTabs slug="winos" sections={STOREFRONT_SECTIONS} tabs={{ mode: 'link' }} />);
    expect(tab('Catalogue').className).toContain('border-transparent');
  });

  it('marks the given activeSection with the cobalt underline and no other', () => {
    render(
      <StorefrontTabs
        slug="winos"
        sections={STOREFRONT_SECTIONS}
        tabs={{ mode: 'link', activeSection: 'catalogue' }}
      />,
    );
    expect(tab('Catalogue').className).toContain('border-accent');
    expect(tab('Catalogue')).toHaveAttribute('aria-current', 'true');
    expect(tab('About').className).toContain('border-transparent');
    expect(tab('About')).not.toHaveAttribute('aria-current');
  });

  it('marks the Orders link active when activeSection is "orders", and no section tab is active', () => {
    render(
      <StorefrontTabs
        slug="winos"
        sections={STOREFRONT_SECTIONS}
        tabs={{ mode: 'link', activeSection: 'orders' }}
      />,
    );
    const ordersLink = screen.getByRole('link', { name: 'Orders' });
    expect(ordersLink.className).toContain('border-accent');
    expect(ordersLink).toHaveAttribute('aria-current', 'true');
    expect(tab('Catalogue').className).toContain('border-transparent');
    expect(tab('Catalogue')).not.toHaveAttribute('aria-current');
  });

  it('leaves the Orders link inactive when activeSection is "catalogue"', () => {
    render(
      <StorefrontTabs
        slug="winos"
        sections={STOREFRONT_SECTIONS}
        tabs={{ mode: 'link', activeSection: 'catalogue' }}
      />,
    );
    const ordersLink = screen.getByRole('link', { name: 'Orders' });
    expect(ordersLink.className).toContain('border-transparent');
    expect(ordersLink).not.toHaveAttribute('aria-current');
  });
});
