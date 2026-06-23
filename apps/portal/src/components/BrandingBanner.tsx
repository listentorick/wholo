'use client';

import { useEffect, useRef } from 'react';

interface Props {
  logoUrl: string | null;
  bannerUrl: string | null;
  dominantColor: string | null;
  onScrolledPast: (past: boolean) => void;
}

export function BrandingBanner({ logoUrl, bannerUrl, dominantColor, onScrolledPast }: Props) {
  const bannerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const gradientStart = dominantColor ?? '#e8ddd0';

  useEffect(() => {
    const el = bannerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => onScrolledPast(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onScrolledPast]);

  useEffect(() => {
    const handleScroll = () => {
      if (!imgRef.current) return;
      imgRef.current.style.transform = `translateY(${-window.scrollY * 0.15}px)`;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
        .anim-banner { animation: scaleIn 0.5s ease both 0.1s; }

        .home-banner { width: 100%; height: 38vh; min-height: 180px; position: relative; overflow: hidden; }
        @media (min-width: 481px)  { .home-banner { max-height: 260px; } }
        @media (min-width: 768px)  { .home-banner { height: 42vh; max-height: 360px; } }
        @media (min-width: 1024px) { .home-banner { height: 30vh; max-height: 420px; } }

        .logo-circle {
          position: absolute;
          bottom: -36px;
          left: 50%;
          transform: translateX(-50%);
          width: 72px;
          height: 72px;
          border-radius: 50%;
          border: 3px solid white;
          overflow: hidden;
          background: #f3f4f6;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          z-index: 10;
        }
        @media (min-width: 768px) {
          .logo-circle { width: 88px; height: 88px; bottom: -44px; }
        }
      `}</style>

      <div ref={bannerRef} className="home-banner anim-banner">
        {/* Base gradient layer — always present */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(160deg, ${gradientStart} 0%, #d4c5b0 40%, #c9b99a 100%)`,
          }}
        />
        <svg className="absolute inset-0 h-full w-full opacity-[0.18]" xmlns="http://www.w3.org/2000/svg">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.12) 100%)' }}
        />

        {/* Banner image layer — parallaxes within container */}
        {bannerUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={bannerUrl}
              alt=""
              style={{
                position: 'absolute',
                width: '100%',
                height: '150%',
                top: '-25%',
                objectFit: 'cover',
                willChange: 'transform',
              }}
              draggable={false}
            />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.25) 100%)' }}
            />
          </>
        )}

        {/* Logo circle — stays fixed relative to container, not the parallax image */}
        <div className="logo-circle">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className="h-full w-full" style={{ background: '#e5e7eb' }} />
          )}
        </div>
      </div>
    </>
  );
}
