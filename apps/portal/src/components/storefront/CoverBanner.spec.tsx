import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoverBanner, heightAt, FULL_DESKTOP, FULL_MOBILE, MIN_DESKTOP, MIN_MOBILE, COLLAPSE_DISTANCE } from './CoverBanner';

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

describe('heightAt', () => {
  // The single source of truth for the collapse curve — use-scroll-spy's
  // correctedTargetY inverts this by bisection, so it must stay a genuine
  // monotonic, bounded function of scroll position for that to work.
  it('is full height at or above the top of the page', () => {
    expect(heightAt(0, false)).toBe(FULL_DESKTOP);
    expect(heightAt(-50, false)).toBe(FULL_DESKTOP);
    expect(heightAt(0, true)).toBe(FULL_MOBILE);
  });

  it('is min height at or past the collapse distance', () => {
    expect(heightAt(COLLAPSE_DISTANCE, false)).toBe(MIN_DESKTOP);
    expect(heightAt(COLLAPSE_DISTANCE + 500, false)).toBe(MIN_DESKTOP);
    expect(heightAt(COLLAPSE_DISTANCE, true)).toBe(MIN_MOBILE);
  });

  it('interpolates linearly in between', () => {
    expect(heightAt(COLLAPSE_DISTANCE / 2, false)).toBeCloseTo((FULL_DESKTOP + MIN_DESKTOP) / 2, 5);
  });

  it('is monotonically non-increasing everywhere', () => {
    let previous = heightAt(-100, false);
    for (let y = -100; y <= COLLAPSE_DISTANCE + 100; y += 10) {
      const current = heightAt(y, false);
      expect(current).toBeLessThanOrEqual(previous);
      previous = current;
    }
  });
});

describe('CoverBanner', () => {
  it('renders nothing when the distributor has no banner', () => {
    const { container } = render(<CoverBanner bannerUrl={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the banner image when a bannerUrl is set', () => {
    const { container } = render(<CoverBanner bannerUrl="https://cdn.example/b.webp" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/b.webp');
  });

  it('sets the collapsed height on scroll (full height at the top of the page)', () => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    const { container } = render(<CoverBanner bannerUrl="https://cdn.example/b.webp" />);
    const el = container.querySelector('.cover-banner') as HTMLElement;
    expect(el.style.height).toBe('300px');
  });

  it('skips the scroll collapse under prefers-reduced-motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    const { container } = render(<CoverBanner bannerUrl="https://cdn.example/b.webp" />);
    const el = container.querySelector('.cover-banner') as HTMLElement;
    expect(el.style.height).toBe('');
  });
});
