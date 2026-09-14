'use client';

import { useEffect, useRef } from 'react';

interface Props {
  bannerUrl: string | null;
}

export const FULL_DESKTOP = 300;
export const FULL_MOBILE = 150;
export const MIN_DESKTOP = 72;
export const MIN_MOBILE = 56;
export const COLLAPSE_DISTANCE = 220;

/**
 * The banner's settled height at scroll position `y`: linearly interpolating
 * from `full` at y=0 down to `min` at y=COLLAPSE_DISTANCE, clamped flat
 * outside that range. Exported as the single source of truth for this curve —
 * this component's own render loop below calls it, and so does
 * use-scroll-spy's `correctedTargetY` (by bisection, since it needs to invert
 * this to compute a scroll target). Sharing the function itself, not just its
 * endpoint constants, means a future change to *how* the banner collapses
 * (easing, a different curve) can't silently desync the two — the scroll
 * target math stays correct for whatever this returns, unchanged.
 */
export function heightAt(y: number, mobile: boolean): number {
  const full = mobile ? FULL_MOBILE : FULL_DESKTOP;
  const min = mobile ? MIN_MOBILE : MIN_DESKTOP;
  const t = Math.min(1, Math.max(0, y / COLLAPSE_DISTANCE));
  return full - (full - min) * t;
}

/**
 * The distributor's cover image. Renders nothing when the distributor hasn't set
 * a banner — the shop header just sits directly under the platform nav strip.
 * When present, the height collapses on scroll (a plain `style.height` write per
 * frame); `prefers-reduced-motion` skips the collapse and the banner scrolls away.
 */
export function CoverBanner({ bannerUrl }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      el.style.height = `${Math.round(heightAt(window.scrollY, window.innerWidth < 768))}px`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [bannerUrl]);

  if (!bannerUrl) return null;

  return (
    <div ref={ref} className="cover-banner relative w-full overflow-hidden border-b border-border">
      <style>{`
        .cover-banner { height: ${FULL_MOBILE}px; }
        @media (min-width: 768px) { .cover-banner { height: ${FULL_DESKTOP}px; } }
      `}</style>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bannerUrl}
        alt=""
        className="absolute inset-0 h-full w-full bg-canvas object-cover"
        draggable={false}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.22) 100%)' }}
      />
    </div>
  );
}
