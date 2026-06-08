'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';

export default function DistributorHomePage() {
  const params = useParams();
  const distributorSlug = params.distributorSlug as string;
  const pathname = usePathname();
  const router = useRouter();

  const { user, isLoading } = useRequireAuth(pathname ?? `/${distributorSlug}`);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#D97036] border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  const actions = [
    {
      label: 'New Order',
      onClick: () => router.push(`/${distributorSlug}/products`),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.25} stroke="currentColor" className="h-7 w-7">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      ),
    },
    {
      label: 'Favourites',
      onClick: () => {},
      icon: (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.25} stroke="currentColor" className="h-7 w-7">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
    },
    {
      label: 'Orders',
      onClick: () => {},
      icon: (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.25} stroke="currentColor" className="h-7 w-7">
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <line x1="8" y1="8" x2="16" y2="8" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="8" y1="16" x2="12" y2="16" />
        </svg>
      ),
    },
    {
      label: 'Standing Orders',
      onClick: () => {},
      icon: (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.25} stroke="currentColor" className="h-7 w-7">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
  ];

  return (
    <>
      <style>{`
        @keyframes fadeDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
        .anim-nav    { animation: fadeDown 0.4s ease both; }
        .anim-banner { animation: scaleIn 0.5s ease both 0.1s; }
        .anim-welcome{ animation: fadeUp  0.4s ease both 0.25s; }
        .anim-tile-0 { animation: fadeUp  0.4s ease both 0.32s; }
        .anim-tile-1 { animation: fadeUp  0.4s ease both 0.38s; }
        .anim-tile-2 { animation: fadeUp  0.4s ease both 0.44s; }
        .anim-tile-3 { animation: fadeUp  0.4s ease both 0.50s; }
        .action-tile { transition: background 0.15s, transform 0.15s; }
        .action-tile:active { background: #f9f9f9; transform: scale(0.97); }

        .home-nav    { padding-left: 16px; padding-right: 16px; }
        .home-banner { width: 100%; height: 38vh; min-height: 180px; }
        .home-content { width: 100%; }

        @media (max-width: 480px) {
          .home-banner  { height: 38vh; }
          .tile-icon    { width: 52px; height: 52px; }
          .tile-label   { font-size: 11px; }
          .tile-btn     { padding-top: 36px; padding-bottom: 36px; }
        }

        @media (min-width: 428px) and (max-width: 430px) {
          .home-banner  { height: 40vh; }
          .tile-icon    { width: 58px; height: 58px; }
          .tile-label   { font-size: 12px; }
          .tile-btn     { padding-top: 44px; padding-bottom: 44px; }
          .welcome-text { font-size: 18px; }
        }

        @media (min-width: 411px) and (max-width: 412px) {
          .home-banner  { height: 39vh; }
          .tile-icon    { width: 56px; height: 56px; }
          .tile-label   { font-size: 11.5px; }
          .tile-btn     { padding-top: 40px; padding-bottom: 40px; }
        }

        @media (min-width: 481px) {
          .home-content { max-width: 390px; margin-left: auto; margin-right: auto; }
          .home-banner  { max-height: 260px; }
        }

        @media (min-width: 768px) {
          .home-nav     { padding-left: 24px; padding-right: 24px; }
          .home-banner  { height: 42vh; max-height: 360px; }
        }
      `}</style>

      <div className="flex min-h-screen flex-col bg-white">

        {/* Nav */}
        <nav className="home-nav anim-nav flex w-full items-center justify-between py-3.5 bg-white border-b border-[#E5E7EB]">
          <button className="flex h-9 w-9 items-center justify-center text-[#1A1A1A]" aria-label="Menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
              <line x1="3" y1="6"  x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <button className="flex items-center gap-1.5 text-sm font-medium tracking-wide text-[#1A1A1A]">
            {user.organisationName}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 text-[#9CA3AF]">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <button className="flex h-9 w-9 items-center justify-center text-[#1A1A1A]" aria-label="Cart">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 01-8 0" />
            </svg>
          </button>
        </nav>

        {/* Banner */}
        <div className="home-banner anim-banner relative">
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(160deg, #e8ddd0 0%, #d4c5b0 40%, #c9b99a 100%)' }}
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
        </div>

        {/* Content */}
        <div className="home-content flex flex-col flex-1">

          <div className="anim-welcome flex flex-col items-center pt-7 pb-6">
            <p className="welcome-text text-[17px] font-light tracking-wide text-[#1A1A1A]">
              Welcome back {user.firstName}&nbsp;!
            </p>
            <div className="mt-2.5 h-px w-8 bg-[#D97036]" />
          </div>

          <div className="grid grid-cols-2 gap-px bg-[#E5E7EB] border-t border-[#E5E7EB] flex-1">
            {actions.map((action, i) => (
              <button
                key={action.label}
                onClick={action.onClick}
                className={`action-tile tile-btn anim-tile-${i} flex flex-col items-center justify-center gap-3 bg-white text-[#9CA3AF] hover:text-[#1A1A1A]`}
              >
                <span className="tile-icon flex items-center justify-center rounded-full border border-[#E5E7EB] text-[#9CA3AF]">
                  {action.icon}
                </span>
                <span className="tile-label font-normal tracking-wide text-[#9CA3AF]">
                  {action.label}
                </span>
              </button>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}
