import { render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Reveal } from './Reveal';

/**
 * Reveal is a CSS-transition entrance: it must never leave content
 * permanently hidden, and it must not touch anything when motion is off
 * (jsdom's matchMedia reports reduce-motion + coarse pointer via test setup,
 * which is what useMotionOK reads through the default context value here).
 */

type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
let ioCallbacks: IOCallback[] = [];

beforeEach(() => {
  ioCallbacks = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IOCallback) {
        ioCallbacks.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Reveal', () => {
  it('always renders its children', () => {
    render(
      <Reveal>
        <p>visible copy</p>
      </Reveal>,
    );
    expect(screen.getByText('visible copy')).toBeInTheDocument();
  });

  it('does not leave above-fold content hidden on mount', () => {
    render(
      <Reveal>
        <p>copy</p>
      </Reveal>,
    );
    const el = screen.getByText('copy').parentElement!;
    expect(el.getAttribute('data-reveal')).not.toBe('hidden');
    expect(screen.getByText('copy')).toBeVisible();
  });

  it('reveals below-fold content when it scrolls into view', () => {
    // Force the "below the fold on mount" branch.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 10_000,
      bottom: 10_100,
      left: 0,
      right: 0,
      width: 0,
      height: 100,
      x: 0,
      y: 10_000,
      toJSON: () => ({}),
    } as DOMRect);

    render(
      <Reveal>
        <p>deferred copy</p>
      </Reveal>,
    );
    const el = screen.getByText('deferred copy').parentElement!;

    if (el.getAttribute('data-reveal') === 'hidden') {
      // motion was on: an observer was registered — fire it
      expect(ioCallbacks.length).toBeGreaterThan(0);
      act(() => ioCallbacks[0]!([{ isIntersecting: true }]));
    }
    expect(el.getAttribute('data-reveal')).toBe('shown');
    expect(screen.getByText('deferred copy')).toBeVisible();
  });

  it('staggers direct children via data-reveal-stagger', () => {
    render(
      <Reveal stagger={0.08}>
        <p>one</p>
        <p>two</p>
      </Reveal>,
    );
    const el = screen.getByText('one').parentElement!;
    expect(el).toHaveAttribute('data-reveal-stagger');
  });
});
