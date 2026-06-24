'use client';

import { useState, useEffect } from 'react';
import { useParams, usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useDistributor } from '@/lib/distributor-context';
import { portalApi } from '@wholo/api-client';

export default function DistributorHomePage() {
  const params = useParams();
  const distributorSlug = params.distributorSlug as string;
  const pathname = usePathname();

  const { user, accessToken, isLoading } = useRequireAuth(pathname ?? `/${distributorSlug}`);
  const { distributor } = useDistributor();
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

  const hasContent = distributor?.tagline || distributor?.aboutText;

  return (
    <>
      <div className={`px-5 py-8 max-w-lg mx-auto w-full ${hasRelationship === false ? 'pb-24' : ''}`}>
        {hasContent && (
          <div className="mb-6">
            {distributor?.tagline && (
              <p className="text-sm text-[#D97036] tracking-wide">{distributor.tagline}</p>
            )}
          </div>
        )}

        {distributor?.aboutText && (
          <div className="prose prose-sm prose-gray">
            <ReactMarkdown>{distributor.aboutText}</ReactMarkdown>
          </div>
        )}
      </div>

      {hasRelationship === false && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#E5E7EB] bg-white px-5 py-4">
          <div className="max-w-lg mx-auto">
            <button
              className="w-full bg-[#D97036] text-white py-3 text-sm font-medium hover:bg-[#C4622A] transition-colors"
              onClick={() => {}}
            >
              Connect with this business
            </button>
          </div>
        </div>
      )}
    </>
  );
}
