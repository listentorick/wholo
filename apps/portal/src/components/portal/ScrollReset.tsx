'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { correctedTargetY } from '@/lib/hooks/use-scroll-spy';
import { STOREFRONT_MAIN_ID, isStorefrontSubpageRoute } from '@/lib/distributor-routes';

/**
 * Lands the window at the right spot on forward navigation between distributor
 * routes. Next's own post-navigation scroll targets the *changed route
 * segment* (the content inside `<main>`), not the document top — with the
 * persistent storefront chrome sitting above `<main>`, that lands you mid-page
 * instead of at the intended spot, and (worse) the document-height thrash
 * while the new page's data loads repeatedly clamps `scrollY`, which makes
 * `CoverBanner`'s scroll-driven height flicker. Correcting `scrollY` on every
 * frame for a short settle window fixes both.
 *
 * The target itself is route-aware: the storefront route (and anything else
 * outside the storefront sub-page group, e.g. checkout) targets the document
 * top; a storefront sub-page (product detail, orders) targets the top of its
 * own `<main>` content instead — below the persistent chrome, which by then
 * has collapsed to its resting size, exactly as if you'd scrolled there on
 * the storefront itself. `correctedTargetY` (shared with `useScrollSpy`'s
 * same-page section jumps) is what makes that self-consistent even while the
 * banner is still animating its own collapse.
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
 * race on some navigations. Recomputing the target fresh on every frame (not
 * just re-asserting a fixed value) is also what lets a sub-page landing
 * self-correct as the chrome above `<main>` finishes settling.
 */
const SETTLE_FRAMES = 12; // ~200ms at 60fps — comfortably outlasts Next's post-nav scroll handling

export function ScrollReset({ distributorSlug }: { distributorSlug: string }) {
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

    const isSubpage = isStorefrontSubpageRoute(distributorSlug, pathname ?? '');

    // The document top for the storefront route and anything outside the
    // storefront sub-page group (checkout, the bare products redirect); the
    // top of `<main>` — below the persistent chrome — for a sub-page. Read
    // fresh on every tick since the chrome's height (and so `<main>`'s top)
    // can still be settling.
    const targetY = (): number => {
      if (!isSubpage) return 0;
      const main = document.getElementById(STOREFRONT_MAIN_ID);
      if (!main) return 0; // chrome/main not mounted yet — next tick corrects once it is
      const marginTop = parseFloat(getComputedStyle(main).scrollMarginTop) || 0;
      const rawTargetY = window.scrollY + main.getBoundingClientRect().top - marginTop;
      return correctedTargetY(rawTargetY);
    };

    let rafId = 0;
    let frame = 0;
    const tick = () => {
      if (window.location.hash) return;
      const y = targetY();
      if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
      frame += 1;
      if (frame < SETTLE_FRAMES) rafId = requestAnimationFrame(tick);
    };
    window.scrollTo(0, targetY());
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [pathname, distributorSlug]);

  return null;
}
