'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (typeof history !== 'undefined') history.replaceState(null, '', `#${id}`);
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
