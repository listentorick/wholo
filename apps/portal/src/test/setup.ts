import '@testing-library/jest-dom';
import { vi } from 'vitest';

// jsdom implements none of the layout/observer APIs the storefront chrome relies
// on (scroll-spy, the collapsing cover banner, the sticky-stack height probe).
// Install inert baseline stubs here so any component that only *mounts* an
// observer renders without throwing; specs that need to drive the callback still
// override these with a richer `vi.stubGlobal` (see BrandingBanner.spec / the
// storefront specs).

if (!('IntersectionObserver' in globalThis)) {
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
      takeRecords: vi.fn(() => []),
    })),
  );
}

if (!('ResizeObserver' in globalThis)) {
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
  );
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

if (!('matchMedia' in window)) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}
