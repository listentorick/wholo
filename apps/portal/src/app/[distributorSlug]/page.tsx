'use client';

import { useParams, usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useDistributor } from '@/lib/distributor-context';
import { useDeliveryParts } from '@/lib/hooks/use-delivery-parts';
import { PageShell, PageSpinner } from '@/components/PageShell';
import { TruckIcon } from '@/components/DistributorPageHeader';
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

function GetInTouch({ distributor, className = '' }: { distributor: DistributorInfo; className?: string }) {
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
    <div className={`bg-surface-highlight p-6 ${className}`}>
      <p className="text-xs font-semibold text-foreground-secondary mb-0.5 uppercase tracking-wider">
        Get in touch
      </p>
      <p className="text-base font-semibold text-foreground">
        <span className="text-highlight mr-1.5">··</span>Got questions?
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

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold leading-none text-foreground">{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
    </div>
  );
}

function KeyInfo({
  distributor,
  hasRelationship,
  effectiveMinSpend,
  distributorSlug,
  accessToken,
  className = '',
}: {
  distributor: DistributorInfo;
  hasRelationship: boolean | null;
  effectiveMinSpend: number | null;
  distributorSlug: string;
  accessToken: string | null;
  className?: string;
}) {
  const deliveryParts = useDeliveryParts(distributorSlug, accessToken, { enabled: hasRelationship === true });

  const hasCustomerStat = distributor.customerCount > 0;
  const hasMinSpendStat = effectiveMinSpend !== null;
  const hasStats = hasCustomerStat || hasMinSpendStat;
  const showCta = hasRelationship === false;

  return (
    <div className={`bg-surface-highlight p-6 ${className}`}>
      <p className="text-xs font-semibold text-foreground-secondary mb-3 uppercase tracking-wider">
        Key Info
      </p>

      {hasStats && (
        <div className="flex gap-6">
          {hasCustomerStat && <StatTile value={String(distributor.customerCount)} label="active customers" />}
          {hasMinSpendStat && <StatTile value={`£${effectiveMinSpend!.toFixed(2)}`} label="minimum order" />}
        </div>
      )}

      {deliveryParts && (
        <div className={`flex items-center gap-2 text-sm text-foreground-tertiary ${hasStats ? 'mt-4' : ''}`}>
          <TruckIcon />
          <span>
            Order by <strong className="font-semibold text-foreground">{deliveryParts.time}</strong>
            {', '}{deliveryParts.cutoffDayLabel} for delivery on{' '}
            <strong className="font-semibold text-foreground">{deliveryParts.dayName} {deliveryParts.dayOrdinal}</strong>
          </span>
        </div>
      )}

      {showCta && (
        <div className={hasStats ? 'mt-4' : ''}>
          <button
            className="w-full bg-accent text-white px-6 py-2.5 text-sm font-medium hover:bg-accent-hover transition-colors"
            onClick={() => {}}
          >
            Connect with this business
          </button>
        </div>
      )}
    </div>
  );
}

export default function DistributorHomePage() {
  const params = useParams();
  const distributorSlug = params.distributorSlug as string;
  const pathname = usePathname();

  const { user, accessToken, isLoading } = useRequireAuth(pathname ?? `/${distributorSlug}`);
  const { distributor, hasRelationship, relationshipMinSpend } = useDistributor();

  if (isLoading) {
    return (
      <PageShell center>
        <PageSpinner />
      </PageShell>
    );
  }

  if (!user) return null;

  const hasAbout = distributor?.tagline || distributor?.aboutText;
  const hasContact = distributor && (
    distributor.email || distributor.phone ||
    distributor.addressLine1 || distributor.addressCity
  );

  const effectiveMinSpend =
    hasRelationship === true
      ? relationshipMinSpend
      : hasRelationship === false
        ? (distributor?.minimumOrderSpend ?? null)
        : null;
  const hasKeyInfo = distributor != null && (
    distributor.customerCount > 0 || effectiveMinSpend !== null || hasRelationship === false
  );

  const hasSidebar = hasKeyInfo || hasContact;

  return (
    <PageShell width="full" padding="none" className="px-5 pb-8">
      <div className={`grid grid-cols-1 gap-8 items-start ${hasSidebar ? 'md:grid-cols-[1fr_280px] xl:grid-cols-[1fr_280px_280px]' : ''}`}>

        {/* About column */}
        <div className="md:col-start-1 md:row-start-1">
          {hasAbout && (
            <div className="mb-6">
              {distributor?.tagline && (
                <p className="text-sm text-highlight tracking-wide">{distributor.tagline}</p>
              )}
            </div>
          )}
          {distributor?.aboutText && (
            <div className="prose prose-sm prose-gray max-w-none">
              <ReactMarkdown>{distributor.aboutText}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Mobile: divider before the sidebar content */}
        {hasSidebar && <div className="md:hidden border-t border-border -mt-2" />}

        {hasSidebar && (
          <div className="md:col-start-2 md:row-start-1 flex flex-col gap-8 xl:contents">
            {distributor && hasKeyInfo && (
              <KeyInfo
                distributor={distributor}
                hasRelationship={hasRelationship}
                effectiveMinSpend={effectiveMinSpend}
                distributorSlug={distributorSlug}
                accessToken={accessToken}
                className="xl:col-start-2 xl:row-start-1"
              />
            )}

            {distributor && (
              <GetInTouch
                distributor={distributor}
                className="xl:col-start-3 xl:row-start-1"
              />
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
