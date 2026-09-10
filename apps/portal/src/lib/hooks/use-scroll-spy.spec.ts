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

  it('scrollToSection sets the active id, scrolls and updates the hash', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const replaceState = vi.spyOn(history, 'replaceState');
    const { result } = renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery']));
    act(() => result.current[1]('delivery'));
    expect(result.current[0]).toBe('delivery');
    expect(scrollIntoView).toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith(null, '', '#delivery');
  });

  it('does not observe until ready is true', () => {
    renderHook(() => useScrollSpy(['catalogue', 'about', 'delivery'], false));
    expect(observed).toHaveLength(0);
  });
});
