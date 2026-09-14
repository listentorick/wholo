'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FULL_DESKTOP, FULL_MOBILE, MIN_DESKTOP, MIN_MOBILE, COLLAPSE_DISTANCE } from '@/components/storefront/CoverBanner';

/**
 * The cover banner's height is a function of scroll position (see
 * CoverBanner.tsx), so scrolling to a section changes the banner's height
 * mid-flight, which shifts every section below it — a fixed scroll target
 * (e.g. native scrollIntoView) overshoots or undershoots as a result. Solve
 * for the scroll position whose resulting banner height is self-consistent
 * with that position: `finalY = rawTargetY - (currentBannerHeight - heightAt(finalY))`.
 * Because `heightAt` is monotonic and full > min, this has exactly one root;
 * find it by checking which of its three linear pieces it falls in. Depends
 * on CoverBanner writing `el.style.height` directly with no CSS transition —
 * a transition would make the live height read reflect an in-progress value
 * instead of the settled one.
 */
function correctedTargetY(rawTargetY: number): number {
  const banner = document.querySelector<HTMLElement>('.cover-banner');
  if (!banner) return rawTargetY;
  const currentBannerHeight = banner.getBoundingClientRect().height;

  const mobile = window.innerWidth < 768;
  const full = mobile ? FULL_MOBILE : FULL_DESKTOP;
  const min = mobile ? MIN_MOBILE : MIN_DESKTOP;

  const belowZero = rawTargetY - currentBannerHeight + full;
  if (belowZero < 0) return belowZero;

  const inBand = (rawTargetY - currentBannerHeight + full) / (1 + (full - min) / COLLAPSE_DISTANCE);
  if (inBand >= 0 && inBand < COLLAPSE_DISTANCE) return inBand;

  return rawTargetY - currentBannerHeight + min;
}

/** Live `--sticky-stack-h` (published by StickyShopBlock's ResizeObserver), in px. */
function stickyStackHeight(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-stack-h')) || 0;
}

/**
 * Scroll-spy for the single-page storefront. Given the section ids in document
 * order, returns the id currently under the sticky shop block and a
 * `scrollToSection` that smooth-scrolls to one (the landing offset is pure CSS —
 * `scroll-margin-top: var(--sticky-stack-h)` on the section).
 *
 * The active section is the last one (in document order) whose top has
 * scrolled up to/past `--sticky-stack-h` — the same boundary `scrollToSection`
 * targets via `scroll-margin-top`, so the two stay consistent by construction.
 * (An `IntersectionObserver`'s "is this section's top edge past the sticky
 * stack" can't be answered by `isIntersecting` alone: adjacent sections share
 * a boundary with no gap, so right after landing on one, the previous section
 * can still have a sliver of overlap and remains "intersecting" too — picking
 * the first such match by document order then keeps the *previous* section
 * active. Measuring `getBoundingClientRect().top` directly avoids that.) A
 * short last section that can't reach the top of the viewport is handled by a
 * bottom-of-page fallback.
 *
 * A click pins its target active immediately and holds it there for the
 * whole scroll gesture that follows — without this, the boundary-crossing
 * check above (correctly) reports the section still mid-transit during the
 * animation, which would flip the highlight back and forth until it lands.
 *
 * Arriving here fresh with a URL hash (a cross-route `<Link href="/{slug}#about">`
 * from a sub-page like Orders, `StorefrontTabs`'s `mode: 'link'`) can't rely
 * on the browser's native one-shot hash-scroll: it fires before the cover
 * banner's scroll-driven collapse and Catalogue's async product fetch have
 * settled, targeting a layout that's about to change size by thousands of
 * pixels with nothing to correct it afterwards. Land the same way a same-page
 * click already does instead — via `scrollToSection` — and keep re-landing
 * while the page is still visibly growing, until it stops.
 */
export function useScrollSpy(ids: string[], ready = true): [string, (id: string) => void] {
  const [activeId, setActiveId] = useState(ids[0] ?? '');
  const idsKey = ids.join('|');
  // True while a click-triggered scroll is still settling; cleared once
  // `scroll` events stop arriving (see the debounce in the effect below).
  const suppressRef = useRef(false);

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActiveId(id);
    suppressRef.current = true;
    if (typeof history !== 'undefined') history.replaceState(null, '', `#${id}`);

    const marginTop = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    const rawTargetY = window.scrollY + el.getBoundingClientRect().top - marginTop;
    const targetY = correctedTargetY(rawTargetY);

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo(0, targetY);
      return;
    }
    window.scrollTo({ top: targetY, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const orderedIds = idsKey ? idsKey.split('|') : [];
    if (orderedIds.length === 0) return;

    // A couple of px of tolerance absorbs the sub-pixel gap a settled smooth
    // scroll can leave short of the exact boundary (float rounding in the
    // scroll math), so the section it just landed on still counts as current.
    const applyActive = () => {
      // Bottom of the page → force the last section (it may be too short to
      // ever occupy the top of the viewport).
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        setActiveId(orderedIds[orderedIds.length - 1]);
        return;
      }
      const boundary = stickyStackHeight() + 2;
      let current = orderedIds[0];
      for (const id of orderedIds) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= boundary) current = id;
      }
      setActiveId(current);
    };

    // While a click-triggered scroll is in flight, `applyActive` is
    // geometrically correct about the mid-transit position — which is
    // exactly what we don't want shown. Hold it off, re-arming a short
    // debounce on every `scroll` event, until scrolling actually stops.
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const recompute = () => {
      if (suppressRef.current) {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          suppressRef.current = false;
          applyActive();
        }, 120);
        return;
      }
      applyActive();
    };

    // See the doc comment above: a hash naming one of our sections means this
    // is a fresh cross-route arrival that needs the same banner-aware landing
    // a same-page click gets, kept up to date while Catalogue's product grid
    // (or anything else) is still changing the page's height.
    let layoutObserver: ResizeObserver | undefined;
    let layoutSettleTimer: ReturnType<typeof setTimeout> | undefined;
    let layoutMaxTimer: ReturnType<typeof setTimeout> | undefined;
    const stopCorrectingLayout = () => layoutObserver?.disconnect();

    const hashId = window.location.hash.slice(1);
    if (orderedIds.includes(hashId)) {
      scrollToSection(hashId);
      layoutObserver = new ResizeObserver(() => {
        scrollToSection(hashId);
        clearTimeout(layoutSettleTimer);
        layoutSettleTimer = setTimeout(stopCorrectingLayout, 200);
      });
      layoutObserver.observe(document.body);
      // A genuine user scroll takes precedence over this correction.
      window.addEventListener('wheel', stopCorrectingLayout, { once: true, passive: true });
      window.addEventListener('touchstart', stopCorrectingLayout, { once: true, passive: true });
      // Safety net: never keep correcting indefinitely if layout never settles.
      layoutMaxTimer = setTimeout(stopCorrectingLayout, 3000);
    } else {
      recompute();
    }

    window.addEventListener('scroll', recompute, { passive: true });
    window.addEventListener('resize', recompute);

    // --sticky-stack-h can change independent of scrolling (e.g. the amber
    // order-by bar's min-spend message toggling on, or the condensed header
    // phasing in) — StickyShopBlock republishes it via a style mutation on
    // <html>, so recompute then too; `boundary` above always reads it live.
    const heightObserver = new MutationObserver(recompute);
    heightObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

    return () => {
      clearTimeout(settleTimer);
      clearTimeout(layoutSettleTimer);
      clearTimeout(layoutMaxTimer);
      layoutObserver?.disconnect();
      window.removeEventListener('wheel', stopCorrectingLayout);
      window.removeEventListener('touchstart', stopCorrectingLayout);
      window.removeEventListener('scroll', recompute);
      window.removeEventListener('resize', recompute);
      heightObserver.disconnect();
    };
  }, [idsKey, ready, scrollToSection]);

  return [activeId, scrollToSection];
}
