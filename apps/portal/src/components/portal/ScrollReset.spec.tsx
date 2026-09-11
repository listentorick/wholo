import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockPathname: string;
vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }));

import { ScrollReset } from './ScrollReset';

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

describe('ScrollReset', () => {
  it('renders nothing', () => {
    const { container } = render(<ScrollReset />);
    expect(container.firstChild).toBeNull();
  });

  it('scrolls to the top on a plain pathname change, then keeps correcting on every frame for the settle window', () => {
    const { rerender } = render(<ScrollReset />);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    vi.mocked(window.scrollTo).mockClear();

    mockPathname = '/winos/products/p1';
    rerender(<ScrollReset />);
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
    const { rerender } = render(<ScrollReset />);
    mockPathname = '/winos/products/p1';
    rerender(<ScrollReset />);
    vi.mocked(window.scrollTo).mockClear();

    for (let i = 0; i < 20; i++) flushRaf();
    expect(rafCallbacks).toHaveLength(0);
  });

  it('does not scroll when the URL carries a hash', () => {
    window.location.hash = '#catalogue';
    const { rerender } = render(<ScrollReset />);
    vi.mocked(window.scrollTo).mockClear();

    mockPathname = '/winos';
    rerender(<ScrollReset />);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('skips the reset once after a popstate (back/forward), then resumes on the next change', () => {
    const { rerender } = render(<ScrollReset />);
    vi.mocked(window.scrollTo).mockClear();

    window.dispatchEvent(new PopStateEvent('popstate'));
    mockPathname = '/winos/orders';
    rerender(<ScrollReset />);
    expect(window.scrollTo).not.toHaveBeenCalled();

    mockPathname = '/winos';
    rerender(<ScrollReset />);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
