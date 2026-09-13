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

/**
 * Scroll-spy for the single-page storefront. Given the section ids in document
 * order, returns the id currently under the sticky shop block and a
 * `scrollToSection` that smooth-scrolls to one (the landing offset is pure CSS —
 * `scroll-margin-top: var(--sticky-stack-h)` on the section).
 *
 * Uses one `IntersectionObserver`; the active section is the topmost one
 * intersecting the band just below the sticky chrome. A short last section that
 * can't reach the top of the viewport is handled by a bottom-of-page fallback.
 */
export function useScrollSpy(ids: string[], ready = true): [string, (id: string) => void] {
  const [activeId, setActiveId] = useState(ids[0] ?? '');
  const idsKey = ids.join('|');
  const visible = useRef<Set<string>>(new Set());

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActiveId(id);
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
    const els = orderedIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el != null);
    if (els.length === 0) return;

    visible.current = new Set();

    const recompute = () => {
      // Bottom of the page → force the last section (it may be too short to
      // ever occupy the top of the viewport).
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        setActiveId(orderedIds[orderedIds.length - 1]);
        return;
      }
      const topmost = orderedIds.find((id) => visible.current.has(id));
      if (topmost) setActiveId(topmost);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting) visible.current.add(id);
          else visible.current.delete(id);
        }
        recompute();
      },
      { rootMargin: '-140px 0px -55% 0px', threshold: 0 },
    );

    els.forEach((el) => observer.observe(el));
    window.addEventListener('scroll', recompute, { passive: true });
    recompute();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', recompute);
    };
  }, [idsKey, ready]);

  return [activeId, scrollToSection];
}
