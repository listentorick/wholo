'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useDistributor } from '@/lib/distributor-context';
import { BrandingBanner } from '@/components/BrandingBanner';

export default function DistributorHomePage() {
  const params = useParams();
  const distributorSlug = params.distributorSlug as string;
  const pathname = usePathname();
  const router = useRouter();

  const { user, isLoading } = useRequireAuth(pathname ?? `/${distributorSlug}`);
  const { distributor, setBannerScrolledPast } = useDistributor();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#D97036] border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  const hasLogo = Boolean(distributor?.logoUrl);

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
      onClick: () => router.push(`/${distributorSlug}/orders`),
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
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .anim-welcome{ animation: fadeUp 0.4s ease both 0.2s; }
        .anim-tile-0 { animation: fadeUp 0.4s ease both 0.26s; }
        .anim-tile-1 { animation: fadeUp 0.4s ease both 0.32s; }
        .anim-tile-2 { animation: fadeUp 0.4s ease both 0.38s; }
        .anim-tile-3 { animation: fadeUp 0.4s ease both 0.44s; }
        .action-tile { transition: background 0.15s, transform 0.15s; }
        .action-tile:active { background: #f9f9f9; transform: scale(0.97); }

        .home-content { width: 100%; }

        @media (max-width: 480px) {
          .tile-icon  { width: 52px; height: 52px; }
          .tile-label { font-size: 11px; }
          .tile-btn   { padding-top: 36px; padding-bottom: 36px; }
        }

        @media (min-width: 428px) and (max-width: 430px) {
          .tile-icon    { width: 58px; height: 58px; }
          .tile-label   { font-size: 12px; }
          .tile-btn     { padding-top: 44px; padding-bottom: 44px; }
          .welcome-text { font-size: 18px; }
        }

        @media (min-width: 481px) {
          .home-content { max-width: 390px; margin-left: auto; margin-right: auto; }
        }
      `}</style>

      <BrandingBanner
        logoUrl={distributor?.logoUrl ?? null}
        bannerUrl={distributor?.bannerUrl ?? null}
        dominantColor={distributor?.bannerDominantColor ?? null}
        onScrolledPast={setBannerScrolledPast}
      />

      {/* Content */}
      <div className="home-content flex flex-col flex-1" style={{ paddingTop: hasLogo ? '44px' : undefined }}>
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
    </>
  );
}
