import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

type IOCallback = (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;
let ioCallback: IOCallback;
const observed: Element[] = [];

beforeEach(() => {
  observed.length = 0;
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn((cb: IOCallback) => {
      ioCallback = cb;
      return {
        observe: (el: Element) => observed.push(el),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
    }),
  );
  document.body.innerHTML = `
    <div id="catalogue"></div>
    <div id="about"></div>
    <div id="delivery"></div>
  `;
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: 5000, configurable: true });
  document.documentElement.style.removeProperty('--sticky-stack-h');
});

import { useScrollSpy } from './use-scroll-spy';

describe('useScrollSpy', () => {
  it('observes each section element', () => {
    renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery']));
    expect(observed.map((el) => el.id)).toEqual(['catalogue', 'about', 'delivery']);
  });

  it('activates the topmost intersecting section', () => {
    const { result } = renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery']));
    act(() => {
      ioCallback([
        { target: document.getElementById('about')!, isIntersecting: true },
        { target: document.getElementById('delivery')!, isIntersecting: true },
      ]);
    });
    expect(result.current[0]).toBe('about');
  });

  it('scrollToSection sets the active id and updates the hash', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.spyOn(document.getElementById('delivery')!, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);
    const replaceState = vi.spyOn(history, 'replaceState');

    const { result } = renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery']));
    act(() => result.current[1]('delivery'));

    expect(result.current[0]).toBe('delivery');
    expect(replaceState).toHaveBeenCalledWith(null, '', '#delivery');
  });

  it('scrolls straight to the raw target when there is no cover banner on the page', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.spyOn(document.getElementById('delivery')!, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);

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
    vi.spyOn(document.getElementById('about')!, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);

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
    vi.spyOn(document.getElementById('catalogue')!, 'getBoundingClientRect').mockReturnValue({ top: 50 } as DOMRect);

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
    vi.spyOn(document.getElementById('about')!, 'getBoundingClientRect').mockReturnValue({ top: 240 } as DOMRect);

    const { result } = renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery']));
    act(() => result.current[1]('about'));

    expect(result.current[0]).toBe('about');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 240);
  });

  it('does not observe until ready is true', () => {
    renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery'], false));
    expect(observed).toHaveLength(0);
  });

  it('bands the observer to the live --sticky-stack-h, not a guessed constant', () => {
    document.documentElement.style.setProperty('--sticky-stack-h', '180px');
    renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery']));

    const IO = window.IntersectionObserver as unknown as { mock: { calls: unknown[][] } };
    const [, options] = IO.mock.calls.at(-1)!;
    expect((options as IntersectionObserverInit).rootMargin).toBe('-180px 0px -55% 0px');
  });

  it('rebuilds the intersection band when --sticky-stack-h changes after mount', async () => {
    renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery']));
    const IO = window.IntersectionObserver as unknown as { mock: { calls: unknown[][] } };
    expect((IO.mock.calls.at(-1)![1] as IntersectionObserverInit).rootMargin).toBe('-0px 0px -55% 0px');

    await act(async () => {
      document.documentElement.style.setProperty('--sticky-stack-h', '96px');
      // MutationObserver callbacks fire as a microtask.
      await Promise.resolve();
    });

    expect((IO.mock.calls.at(-1)![1] as IntersectionObserverInit).rootMargin).toBe('-96px 0px -55% 0px');
  });
});
