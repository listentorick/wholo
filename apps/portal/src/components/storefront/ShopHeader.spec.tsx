import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DistributorInfo } from '@wholo/types';

vi.mock('./RelationshipCta', () => ({ RelationshipCta: () => <div data-testid="cta" /> }));

let mockOrderCount: number | null;
vi.mock('@/lib/hooks/use-viewer-order-count', () => ({ useViewerOrderCount: () => mockOrderCount }));

import { ShopHeader } from './ShopHeader';

const base: DistributorInfo = {
  id: 'd1',
  name: 'Mere Wine Co',
  slug: 'mere',
  logoUrl: null,
  bannerUrl: null,
  bannerDominantColor: null,
  tagline: 'Passionate about wine since 2012',
  aboutText: null,
  email: null,
  phone: null,
  addressLine1: null,
  addressLine2: null,
  addressCity: 'Cheshire',
  addressState: null,
  addressPostcode: null,
  addressCountry: 'UK',
  minimumOrderSpend: null,
  currencyCode: 'GBP',
  customerCount: 0,
  processingDays: [1, 2, 3, 4, 5],
};

let sentinelTop = 500;
let rafCallbacks: FrameRequestCallback[];

beforeEach(() => {
  mockOrderCount = null;
  sentinelTop = 500;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ top: sentinelTop }) as DOMRect,
  );
  rafCallbacks = [];
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

function flushRaf() {
  const pending = rafCallbacks;
  rafCallbacks = [];
  pending.forEach((cb) => cb(0));
}

function renderHeader(onScrolledPast = vi.fn()) {
  render(<ShopHeader distributor={base} relationshipStatus={null} onScrolledPast={onScrolledPast} />);
  return onScrolledPast;
}

/** Simulates a scroll settling with the sentinel at `top`, the same way the
 *  real scroll/resize listener reacts: a 'scroll' event, throttled to one
 *  rAF-scheduled recheck. */
function scrollSentinelTo(top: number) {
  sentinelTop = top;
  window.dispatchEvent(new Event('scroll'));
  flushRaf();
}

describe('ShopHeader', () => {
  it('shows the name, location · tagline line and the relationship CTA', () => {
    renderHeader();
    expect(screen.getByRole('heading', { name: 'Mere Wine Co' })).toBeInTheDocument();
    expect(screen.getByText('Cheshire, UK')).toBeInTheDocument();
    expect(screen.getByText('Passionate about wine since 2012')).toBeInTheDocument();
    expect(screen.getByTestId('cta')).toBeInTheDocument();
  });

  it('shows the order-count line only for a positive count', () => {
    mockOrderCount = 7;
    renderHeader();
    expect(screen.getByText('7 orders with this supplier')).toBeInTheDocument();
  });

  it('hides the order-count line at 0 / null', () => {
    mockOrderCount = 0;
    renderHeader();
    expect(screen.queryByText(/with this supplier/)).toBeNull();
  });

  it('renders an inert (disabled) Message button', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Message' })).toBeDisabled();
  });

  describe('scrolled-past sentinel', () => {
    it('reports not-scrolled-past on mount, before any scroll', () => {
      const onScrolledPast = renderHeader(); // default sentinelTop = 500, far below the viewport top
      expect(onScrolledPast).toHaveBeenLastCalledWith(false);
    });

    it('reports scrolled-past once a scroll settles with the sentinel at the viewport top, not only once strictly negative', () => {
      const onScrolledPast = renderHeader();
      scrollSentinelTo(0);
      expect(onScrolledPast).toHaveBeenLastCalledWith(true);
    });

    it('reports scrolled-past for the exact sub-pixel value a real landing settled at on one machine (a regression case)', () => {
      // IntersectionObserver's own crossing-notification was tried here first and
      // dropped: a landing this close to the boundary is a genuinely degenerate
      // case some browsers never renotify for at all, however long you wait —
      // this direct-geometry-on-scroll approach has no such gap.
      const onScrolledPast = renderHeader();
      scrollSentinelTo(0.2);
      expect(onScrolledPast).toHaveBeenLastCalledWith(true);
    });

    it('reports scrolled-past when comfortably past', () => {
      const onScrolledPast = renderHeader();
      scrollSentinelTo(-50);
      expect(onScrolledPast).toHaveBeenLastCalledWith(true);
    });

    it('reports not-scrolled-past when comfortably before', () => {
      const onScrolledPast = renderHeader();
      scrollSentinelTo(40);
      expect(onScrolledPast).toHaveBeenLastCalledWith(false);
    });

    it('re-checks on resize as well as scroll', () => {
      const onScrolledPast = renderHeader();
      sentinelTop = -10;
      window.dispatchEvent(new Event('resize'));
      flushRaf();
      expect(onScrolledPast).toHaveBeenLastCalledWith(true);
    });

    it('resets to not-scrolled-past on unmount', () => {
      const onScrolledPast = renderHeader();
      scrollSentinelTo(-50);
      expect(onScrolledPast).toHaveBeenLastCalledWith(true);

      cleanup();
      expect(onScrolledPast).toHaveBeenLastCalledWith(false);
    });
  });
});
