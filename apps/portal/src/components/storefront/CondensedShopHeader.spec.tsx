import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { DistributorInfo } from '@wholo/types';

vi.mock('./RelationshipCta', () => ({ RelationshipCta: () => <div data-testid="cta" /> }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ distributorSlug: 'winos' }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/lib/cart-context', () => ({ useCartSafe: () => ({ cartCount: 2 }) }));

import { CondensedShopHeader } from './CondensedShopHeader';

const distributor = { name: 'Mere Wine Co', logoUrl: null } as DistributorInfo;

describe('CondensedShopHeader', () => {
  it('is collapsed (max-h-0 / opacity-0) when the shop header has not scrolled past', () => {
    const { container } = render(
      <CondensedShopHeader distributor={distributor} relationshipStatus={null} scrolledPast={false} />,
    );
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap.className).toContain('max-h-0');
    expect(wrap.className).toContain('opacity-0');
    expect(wrap).toHaveAttribute('aria-hidden', 'true');
  });

  it('expands and shows the distributor name once scrolled past', () => {
    const { container } = render(
      <CondensedShopHeader distributor={distributor} relationshipStatus={null} scrolledPast />,
    );
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap.className).toContain('opacity-100');
    expect(wrap).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByText('Mere Wine Co')).toBeInTheDocument();
  });

  it('always shows the basket, unlike the relationship CTA which is hidden below sm', () => {
    render(<CondensedShopHeader distributor={distributor} relationshipStatus={null} scrolledPast />);
    const basket = screen.getByLabelText('Basket, 2 items');
    expect(basket.className).not.toMatch(/\bhidden\b/);
    expect(basket.parentElement?.className).not.toMatch(/\bhidden\b/);
  });
});
