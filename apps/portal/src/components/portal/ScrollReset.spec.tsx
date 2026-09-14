import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockPathname: string;
vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }));

import { ScrollReset } from './ScrollReset';
import { STOREFRONT_MAIN_ID } from '@/lib/distributor-routes';

let rafCallbacks: FrameRequestCallback[];

beforeEach(() => {
  mockPathname = '/winos';
  window.location.hash = '';
  setScrollY(0);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
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

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true });
}

function flushRaf() {
  // Consume only the callbacks queued so far — a callback that schedules
  // another rAF (as ScrollReset's does) must wait for the *next* flush.
  const pending = rafCallbacks;
  rafCallbacks = [];
  pending.forEach((cb) => cb(0));
}

/** Appends `#storefront-main` with a stubbed geometry, as `<main>` would sit
 *  below the (possibly still-settling) storefront chrome. */
function appendMain({ top = 0, marginTop = 0 }: { top?: number; marginTop?: number } = {}) {
  const el = document.createElement('div');
  el.id = STOREFRONT_MAIN_ID;
  el.style.scrollMarginTop = `${marginTop}px`;
  document.body.appendChild(el);
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top } as DOMRect);
  return el;
}

describe('ScrollReset', () => {
  it('renders nothing', () => {
    const { container } = render(<ScrollReset distributorSlug="winos" />);
    expect(container.firstChild).toBeNull();
  });

  it('scrolls to the top on a plain pathname change to a non-subpage route, then keeps correcting on every frame for the settle window', () => {
    const { rerender } = render(<ScrollReset distributorSlug="winos" />);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    vi.mocked(window.scrollTo).mockClear();

    mockPathname = '/winos/checkout';
    rerender(<ScrollReset distributorSlug="winos" />);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0); // sync correction

    // Simulate Next's own post-nav handler scrolling the page down mid-settle —
    // the very next frame tick must correct it straight back to 0.
    setScrollY(900);
    vi.mocked(window.scrollTo).mockClear();
    flushRaf();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);

    // Once at 0, further frame ticks in the settle window are no-ops.
    setScrollY(0);
    vi.mocked(window.scrollTo).mockClear();
    flushRaf();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('stops correcting once the settle window elapses', () => {
    const { rerender } = render(<ScrollReset distributorSlug="winos" />);
    mockPathname = '/winos/checkout';
    rerender(<ScrollReset distributorSlug="winos" />);
    vi.mocked(window.scrollTo).mockClear();

    for (let i = 0; i < 20; i++) flushRaf();
    expect(rafCallbacks).toHaveLength(0);
  });

  it('does not scroll when the URL carries a hash', () => {
    window.location.hash = '#catalogue';
    const { rerender } = render(<ScrollReset distributorSlug="winos" />);
    vi.mocked(window.scrollTo).mockClear();

    mockPathname = '/winos';
    rerender(<ScrollReset distributorSlug="winos" />);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('skips the reset once after a popstate (back/forward), then resumes on the next change', () => {
    const { rerender } = render(<ScrollReset distributorSlug="winos" />);
    vi.mocked(window.scrollTo).mockClear();

    window.dispatchEvent(new PopStateEvent('popstate'));
    mockPathname = '/winos/orders';
    rerender(<ScrollReset distributorSlug="winos" />);
    expect(window.scrollTo).not.toHaveBeenCalled();

    mockPathname = '/winos';
    rerender(<ScrollReset distributorSlug="winos" />);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });
});

describe('ScrollReset — storefront sub-page landing', () => {
  afterEach(() => {
    document.getElementById(STOREFRONT_MAIN_ID)?.remove();
  });

  it('lands on the top of #storefront-main (adjusted for its scroll-margin-top) instead of the document top, for a product-detail arrival', () => {
    appendMain({ top: 500, marginTop: 150 });
    mockPathname = '/winos/products/p1';
    render(<ScrollReset distributorSlug="winos" />);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 350);
  });

  it('lands on the top of #storefront-main for an orders arrival', () => {
    appendMain({ top: 420, marginTop: 100 });
    mockPathname = '/winos/orders';
    render(<ScrollReset distributorSlug="winos" />);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 320);
  });

  it('falls back to the document top when #storefront-main is not mounted yet', () => {
    mockPathname = '/winos/orders';
    render(<ScrollReset distributorSlug="winos" />);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('recomputes the target fresh on every settle frame as the chrome above <main> finishes settling', () => {
    const main = appendMain({ top: 500, marginTop: 150 });
    mockPathname = '/winos/orders';
    render(<ScrollReset distributorSlug="winos" />);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 350);
    vi.mocked(window.scrollTo).mockClear();

    // The banner finishes collapsing further between frames — main's top moves up.
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue({ top: 300 } as DOMRect);
    flushRaf();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 150);
  });
});
