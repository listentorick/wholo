'use client';

import { useEffect, useRef } from 'react';

interface Props {
  bannerUrl: string | null;
  dominantColor: string | null;
}

const FULL_DESKTOP = 300;
const FULL_MOBILE = 150;
const MIN_DESKTOP = 72;
const MIN_MOBILE = 56;
const COLLAPSE_DISTANCE = 220;

/**
 * The distributor's cover image. Replaces `BrandingBanner` — same gradient +
 * grain fallback, but no hanging logo circle (identity moved into `ShopHeader` /
 * `CondensedShopHeader`) and the height collapses on scroll via a `--cover-h`
 * custom property. `prefers-reduced-motion` skips the collapse (the banner just
 * scrolls away).
 */
export function CoverBanner({ bannerUrl, dominantColor }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const gradientStart = dominantColor ?? '#e8ddd0';

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
  }, []);

  return (
    <div
      ref={ref}
      className="cover-banner relative w-full overflow-hidden border-b border-border"
    >
      <style>{`
        .cover-banner { height: ${FULL_MOBILE}px; }
        @media (min-width: 768px) { .cover-banner { height: ${FULL_DESKTOP}px; } }
      `}</style>

      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(160deg, ${gradientStart} 0%, #d4c5b0 40%, #c9b99a 100%)` }}
      />
      <svg className="absolute inset-0 h-full w-full opacity-[0.18]" xmlns="http://www.w3.org/2000/svg">
        <filter id="cover-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#cover-grain)" />
      </svg>

      {bannerUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.22) 100%)' }}
          />
        </>
      )}
    </div>
  );
}
