import '@testing-library/jest-dom';
import { vi } from 'vitest';

// jsdom has no IntersectionObserver / matchMedia; motion + our providers need them.
if (!('IntersectionObserver' in globalThis)) {
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', IO);
}

if (!window.matchMedia) {
  // Report "reduce motion" in tests so animation code stays inert.
  window.matchMedia = ((query: string) => ({
    matches: /prefers-reduced-motion|pointer: *coarse/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
