'use client';

import { useState, useEffect } from 'react';
import { useParams, usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useDistributor } from '@/lib/distributor-context';
import { portalApi } from '@wholo/api-client';
import type { DistributorInfo } from '@wholo/types';

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 flex-shrink-0 mt-0.5">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 flex-shrink-0 mt-0.5">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 flex-shrink-0 mt-0.5">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function GetInTouch({ distributor }: { distributor: DistributorInfo }) {
  const hasAddress = distributor.addressLine1 || distributor.addressCity;
  const hasContact = hasAddress || distributor.phone || distributor.email;

  if (!hasContact) return null;

  const addressParts = [
    distributor.addressLine1,
    distributor.addressLine2,
    [distributor.addressCity, distributor.addressState, distributor.addressPostcode]
      .filter(Boolean).join(' '),
    distributor.addressCountry,
  ].filter(Boolean);

  return (
    <div className="bg-surface-sidebar p-6">
      <p className="text-xs font-semibold text-foreground-secondary mb-0.5 uppercase tracking-wider">
        Get in touch
      </p>
      <p className="text-base font-semibold text-foreground">
        <span className="text-accent mr-1.5">··</span>Got questions?
      </p>
      <p className="text-sm text-muted mt-1 mb-4">We&apos;d love to hear from you.</p>

      <div className="border-t border-border" />

      <ul className="mt-4 flex flex-col gap-3">
        {hasAddress && (
          <li className="flex items-start gap-2.5 text-sm text-foreground-secondary">
            <span className="text-muted"><MapPinIcon /></span>
            <span className="leading-snug">
              {addressParts.map((part, i) => (
                <span key={i}>{part}{i < addressParts.length - 1 ? <br /> : null}</span>
              ))}
            </span>
          </li>
        )}
        {distributor.phone && (
          <li className="flex items-start gap-2.5 text-sm">
            <span className="text-muted"><PhoneIcon /></span>
            <a href={`tel:${distributor.phone}`} className="text-foreground hover:text-accent transition-colors">
              {distributor.phone}
            </a>
          </li>
        )}
        {distributor.email && (
          <li className="flex items-start gap-2.5 text-sm">
            <span className="text-muted"><MailIcon /></span>
            <a href={`mailto:${distributor.email}`} className="text-foreground hover:text-accent transition-colors break-all">
              {distributor.email}
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}

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
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  const hasAbout = distributor?.tagline || distributor?.aboutText;
  const hasContact = distributor && (
    distributor.email || distributor.phone ||
    distributor.addressLine1 || distributor.addressCity
  );

  return (
    <>
      <div className={`px-5 py-8 max-w-4xl mx-auto w-full ${hasRelationship === false ? 'pb-24' : ''}`}>
        <div className={`grid grid-cols-1 gap-8 ${hasContact ? 'md:grid-cols-[1fr_280px]' : ''}`}>

          {/* About column */}
          <div>
            {hasAbout && (
              <div className="mb-6">
                {distributor?.tagline && (
                  <p className="text-sm text-accent tracking-wide">{distributor.tagline}</p>
                )}
              </div>
            )}
            {distributor?.aboutText && (
              <div className="prose prose-sm prose-gray">
                <ReactMarkdown>{distributor.aboutText}</ReactMarkdown>
              </div>
            )}
          </div>

          {/* Get in touch column */}
          {distributor && (
            <>
              {/* Mobile: divider before contact */}
              {hasContact && (
                <div className="md:hidden border-t border-border -mt-2" />
              )}
              <GetInTouch distributor={distributor} />
            </>
          )}
        </div>
      </div>

      {hasRelationship === false && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-white px-5 py-4">
          <div className="max-w-lg mx-auto">
            <button
              className="w-full bg-accent text-white py-3 text-sm font-medium hover:bg-accent-hover transition-colors"
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
