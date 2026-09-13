'use client';

import { useEffect, useRef } from 'react';

interface Props {
  bannerUrl: string | null;
}

// Exported so use-scroll-spy.ts can predict the banner's resting height when
// computing a nav-click scroll target, without duplicating these numbers.
export const FULL_DESKTOP = 300;
export const FULL_MOBILE = 150;
export const MIN_DESKTOP = 72;
export const MIN_MOBILE = 56;
export const COLLAPSE_DISTANCE = 220;

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
      const mobile = window.innerWidth < 768;
      const full = mobile ? FULL_MOBILE : FULL_DESKTOP;
      const min = mobile ? MIN_MOBILE : MIN_DESKTOP;
      const t = Math.min(1, Math.max(0, window.scrollY / COLLAPSE_DISTANCE));
      el.style.height = `${Math.round(full - (full - min) * t)}px`;
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
