'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Scrolls the window to the top on forward navigation between distributor
 * routes. Next's own post-navigation scroll targets the *changed route
 * segment* (the content inside `<main>`), not the document top — with the
 * persistent storefront chrome sitting above `<main>`, that lands you mid-page
 * instead of at the top, and (worse) the document-height thrash while the new
 * page's data loads repeatedly clamps `scrollY`, which makes `CoverBanner`'s
 * scroll-driven height flicker. Pinning `scrollY` to 0 fixes both.
 *
 * Skips: hash navigations (`#catalogue` etc. own their scroll target) and
 * back/forward (`popstate` — Next's native scroll restoration wins).
 *
 * Corrects on every animation frame for a short window (~200ms) after the
 * `pathname` change, rather than a single fixed retry — Next's own
 * post-navigation scroll handling can run after this component's effect
 * (child effects flush before parent effects), and *which* frame it lands on
 * varies by navigation (observed anywhere from the next frame to several
 * frames later), so a fixed one- or two-shot correction can still lose the
 * race on some navigations.
 */
const SETTLE_FRAMES = 12; // ~200ms at 60fps — comfortably outlasts Next's post-nav scroll handling

export function ScrollReset() {
  const pathname = usePathname();
  const isPop = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      isPop.current = true;
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (isPop.current) {
      isPop.current = false;
      return;
    }
    if (window.location.hash) return;

    let rafId = 0;
    let frame = 0;
    const tick = () => {
      if (window.location.hash) return;
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      frame += 1;
      if (frame < SETTLE_FRAMES) rafId = requestAnimationFrame(tick);
    };
    window.scrollTo(0, 0);
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [pathname]);

  return null;
}
