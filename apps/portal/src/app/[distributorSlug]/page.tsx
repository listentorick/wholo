'use client';

import { useState, useEffect } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { portalApi } from '@wholo/api-client';

export default function DistributorHomePage() {
  const params = useParams();
  const distributorSlug = params.distributorSlug as string;
  const pathname = usePathname();

  const { user, accessToken, isLoading } = useRequireAuth(pathname ?? `/${distributorSlug}`);
  const [hasRelationship, setHasRelationship] = useState<boolean | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    portalApi
      .getMyDistributors(accessToken)
      .then((distributors) => setHasRelationship(distributors.some((d) => d.slug === distributorSlug)))
      .catch(() => setHasRelationship(null));
  }, [accessToken, distributorSlug]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#D97036] border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="px-5 py-8 max-w-lg mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#1A1A1A] mb-1">Winos</h1>
        <p className="text-sm text-[#D97036] tracking-wide">Passionate about wine since 1987</p>
      </div>

      <div className="space-y-4 text-sm text-[#4B5563] leading-relaxed">
        <p>
          Winos is one of Australia's most respected boutique wine distributors, proudly supplying restaurants, bars, and independent retailers with carefully sourced wines from small-batch producers across Victoria, South Australia, and Western Australia.
        </p>
        <p>
          Founded by sommelier Marcus Reid in 1987, Winos began as a passion project connecting chefs with the winemakers they couldn't find anywhere else. Today, we represent over 60 family-owned wineries and maintain direct relationships with every producer in our portfolio.
        </p>
        <p>
          We deliver across metropolitan Melbourne and regional Victoria every Tuesday and Thursday, with same-week turnaround on all standard orders. Our account team is available six days a week to help with recommendations, allocations, and event consulting.
        </p>
      </div>

      {hasRelationship === false && (
        <div className="mt-8">
          <button
            className="bg-[#D97036] text-white px-6 py-3 text-sm font-medium"
            onClick={() => {}}
          >
            Connect with this business
          </button>
        </div>
      )}
    </div>
  );
}
