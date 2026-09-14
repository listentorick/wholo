import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useScrollSpy } from './use-scroll-spy';

function setTop(id: string, top: number) {
  vi.spyOn(document.getElementById(id)!, 'getBoundingClientRect').mockReturnValue({ top } as DOMRect);
}

beforeEach(() => {
  document.body.innerHTML = `
    <div id="catalogue"></div>
    <div id="about"></div>
    <div id="delivery"></div>
  `;
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: 5000, configurable: true });
  document.documentElement.style.removeProperty('--sticky-stack-h');
});

describe('useScrollSpy', () => {
  it('activates the last section whose top has crossed the sticky boundary, not the first still barely overlapping it', () => {
    // Regression for a real production bug: adjacent sections share a
    // boundary with no gap, so right after landing on "about", "catalogue"'s
    // bottom edge can sit a hair short of the boundary too. The active
    // section must resolve to "about" — the last one to have crossed — not
    // "catalogue" just because it's still technically touching the band.
    document.documentElement.style.setProperty('--sticky-stack-h', '143px');
    setTop('catalogue', -3000);
    setTop('about', 143.3); // 0.3px short of the exact boundary, as a settled smooth-scroll left it
    setTop('delivery', 900);

    const { result } = renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery']));

    expect(result.current[0]).toBe('about');
  });

  it('falls back to the earliest section when none have crossed the boundary yet', () => {
    setTop('catalogue', 400);
    setTop('about', 900);
    setTop('delivery', 1400);

    const { result } = renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery']));

    expect(result.current[0]).toBe('catalogue');
  });

  it('forces the last section at the bottom of the page, even if too short to reach the boundary', () => {
    Object.defineProperty(window, 'scrollY', { value: 4100, configurable: true }); // 4100 + 900 >= 5000 - 2
    setTop('catalogue', -4000);
    setTop('about', -1000);
    setTop('delivery', 50);

    const { result } = renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery']));

    expect(result.current[0]).toBe('delivery');
  });

  it('recomputes when --sticky-stack-h changes after mount, without needing a scroll event', async () => {
    setTop('catalogue', -3000);
    setTop('about', 100);
    setTop('delivery', 900);
    const { result } = renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery']));
    expect(result.current[0]).toBe('catalogue');

    await act(async () => {
      document.documentElement.style.setProperty('--sticky-stack-h', '150px');
      await Promise.resolve(); // MutationObserver callbacks fire as a microtask
    });

    expect(result.current[0]).toBe('about');
  });

  it('does nothing until ready is true', () => {
    setTop('about', 100);
    document.documentElement.style.setProperty('--sticky-stack-h', '150px');

    const { result } = renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery'], false));

    expect(result.current[0]).toBe('catalogue');
  });

  it('scrollToSection sets the active id and updates the hash', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    setTop('delivery', 500);
    const replaceState = vi.spyOn(history, 'replaceState');

    const { result } = renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery']));
    act(() => result.current[1]('delivery'));

    expect(result.current[0]).toBe('delivery');
    expect(replaceState).toHaveBeenCalledWith(null, '', '#delivery');
  });

  it('scrolls straight to the raw target when there is no cover banner on the page', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    setTop('delivery', 500);

    const { result } = renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery']));
    act(() => result.current[1]('delivery'));

    expect(scrollTo).toHaveBeenCalledWith({ top: 500, behavior: 'smooth' });
  });

  it('corrects the target downward when the banner will finish collapsing further', () => {
    // Matches the hand-derived worked example: banner currently at full
    // desktop height (300), raw target 500 → the banner will end up at min
    // (72) once scrolled there, so the true resting position is 272, not 500.
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    document.body.appendChild(document.createElement('div')).className = 'cover-banner';
    vi.spyOn(document.querySelector('.cover-banner')!, 'getBoundingClientRect').mockReturnValue({
      height: 300,
    } as DOMRect);
    setTop('about', 500);

    const { result } = renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery']));
    act(() => result.current[1]('about'));

    expect(scrollTo).toHaveBeenCalledWith({ top: 272, behavior: 'smooth' });
  });

  it('corrects the target upward (toward the resting expanded height) when the banner will re-expand', () => {
    // Mirror-image worked example: banner currently collapsed (72, since the
    // page is already scrolled down), raw target 50 (near the top) — the
    // banner will partially re-expand by the time the page rests there.
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    document.body.appendChild(document.createElement('div')).className = 'cover-banner';
    vi.spyOn(document.querySelector('.cover-banner')!, 'getBoundingClientRect').mockReturnValue({
      height: 72,
    } as DOMRect);
    setTop('catalogue', 50);

    const { result } = renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery']));
    act(() => result.current[1]('catalogue'));

    expect(scrollTo).toHaveBeenCalledTimes(1);
    const [[arg]] = scrollTo.mock.calls;
    expect(arg.behavior).toBe('smooth');
    expect(arg.top).toBeCloseTo(136.5, 1);
  });

  it('jumps straight to the corrected target under prefers-reduced-motion, without animating', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    setTop('about', 240);

    const { result } = renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery']));
    act(() => result.current[1]('about'));

    expect(result.current[0]).toBe('about');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 240);
  });
});
