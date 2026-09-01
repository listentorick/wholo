'use client';

import { useState, type ReactNode } from 'react';
import { useParams, usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useDistributor, connectCtaKind, type RelationshipStatus } from '@/lib/distributor-context';
import { useDeliveryParts } from '@/lib/hooks/use-delivery-parts';
import { PageShell, PageSpinner } from '@/components/PageShell';
import { TruckIcon } from '@/components/DistributorPageHeader';
import { RelationshipStatusBadge } from '@/components/RelationshipStatusBadge';
import { ConnectConfirmationModal } from '@/components/ConnectConfirmationModal';
import { Eyebrow } from '@/components/Eyebrow';
import { Button } from '@/components/Button';
import { TradeRelationshipStatus, formatMoney, type DistributorInfo } from '@wholo/types';
import { formatProcessingDays } from '@/lib/format-processing-days';

const ICON = 'h-4 w-4 flex-shrink-0';
const BOX = 'rounded-lg border border-border bg-surface p-6 shadow-sm';

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={`${ICON} mt-0.5`}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={`${ICON} mt-0.5`}>
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={`${ICON} mt-0.5`}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={ICON}>
      <path d="M3 6.5h15.5v11H3z" />
      <path d="M3 10.5h18.5v7H18a3.5 3.5 0 010-7h3.5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={ICON}>
      <path d="M3.5 5.5h17v15h-17z" />
      <path d="M3.5 10.5h17" />
      <path d="M8 3v4M16 3v4" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={ICON}>
      <path d="M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1" />
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M21.5 19v-1a4 4 0 00-3-3.87M16.5 3.63a4 4 0 010 7.74" />
    </svg>
  );
}

/** Box header — the amber eyebrow kicker is the only heading each profile box needs. */
function BoxHeading({ children }: { children: ReactNode }) {
  return <Eyebrow className="mb-3">{children}</Eyebrow>;
}

/**
 * Relationship call-to-action for the not-yet-connected customer — sits at the
 * bottom of the About us card. `connect` shows the "Add this supplier" button
 * (+ confirmation modal); `pending`/`suspended` show a status badge instead.
 * Renders nothing once the relationship is ACTIVE.
 */
function RelationshipCta({
  distributorName,
  relationshipStatus,
}: {
  distributorName: string;
  relationshipStatus: RelationshipStatus | null;
}) {
  const { requestAccess } = useDistributor();
  const [showConfirm, setShowConfirm] = useState(false);
  const ctaKind = connectCtaKind(relationshipStatus);

  if (!ctaKind) return null;

  async function handleConfirm(recentContact: boolean) {
    await requestAccess(recentContact);
    setShowConfirm(false);
  }

  return (
    <div className="mt-5 border-t border-border pt-4">
      {ctaKind === 'connect' && (
        <>
          <p className="mb-3 text-sm text-muted">Request access to see your pricing and place orders.</p>
          <Button fullWidth onClick={() => setShowConfirm(true)}>
            Add this supplier
          </Button>
        </>
      )}

      {ctaKind === 'pending' && (
        <>
          <RelationshipStatusBadge label="Pending" tone="yellow" />
          <p className="mt-1.5 text-xs text-muted">Your request is with this wholesaler.</p>
        </>
      )}

      {ctaKind === 'suspended' && (
        <div className="flex flex-col gap-1.5">
          <RelationshipStatusBadge label="Suspended" tone="red" />
          <p className="text-xs text-muted">Suspended — contact this wholesaler</p>
        </div>
      )}

      {showConfirm && (
        <ConnectConfirmationModal
          distributorName={distributorName}
          onConfirm={handleConfirm}
          onClose={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

function AboutBox({
  distributor,
  relationshipStatus,
  className = '',
}: {
  distributor: DistributorInfo;
  relationshipStatus: RelationshipStatus | null;
  className?: string;
}) {
  return (
    <div className={`${BOX} ${className}`}>
      <BoxHeading>About us</BoxHeading>
      {(distributor.logoUrl || distributor.tagline) && (
        <div className="flex items-center gap-4">
          {distributor.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={distributor.logoUrl}
              alt=""
              className="hidden h-16 w-16 flex-shrink-0 rounded-full border border-muted object-cover lg:block"
              draggable={false}
            />
          )}
          {distributor.tagline && (
            <p className="text-sm font-medium text-primary">{distributor.tagline}</p>
          )}
        </div>
      )}
      {distributor.aboutText && (
        <div className="prose prose-sm prose-gray mt-4 max-w-[68ch]">
          <ReactMarkdown>{distributor.aboutText}</ReactMarkdown>
        </div>
      )}
      <RelationshipCta distributorName={distributor.name} relationshipStatus={relationshipStatus} />
    </div>
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
    <div className={`${BOX} ${className}`}>
      <BoxHeading>Get in touch</BoxHeading>
      <p className="mt-1 text-sm text-muted">Got questions? We&apos;d love to hear from you.</p>

      <div className="mt-4 border-t border-border" />

      <ul className="mt-4 flex flex-col gap-3">
        {hasAddress && (
          <li className="flex items-start gap-2.5 text-sm text-muted">
            <MapPinIcon />
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

function StatTile({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted">{icon}</span>
      <div>
        <p className="text-lg font-semibold leading-tight text-foreground">{value}</p>
        <p className="mt-0.5 text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

function KeyInfo({
  distributor,
  relationshipStatus,
  effectiveMinSpend,
  distributorSlug,
  accessToken,
  className = '',
}: {
  distributor: DistributorInfo;
  relationshipStatus: RelationshipStatus | null;
  effectiveMinSpend: number | null;
  distributorSlug: string;
  accessToken: string | null;
  className?: string;
}) {
  const deliveryParts = useDeliveryParts(distributorSlug, accessToken, {
    enabled: relationshipStatus === TradeRelationshipStatus.ACTIVE,
  });

  const minSpend = effectiveMinSpend !== null
    ? formatMoney(effectiveMinSpend, distributor.currencyCode)
    : null;
  const processingLabel = formatProcessingDays(distributor.processingDays);
  const customerCount = distributor.customerCount > 0 ? String(distributor.customerCount) : null;
  const hasBody = Boolean(minSpend || processingLabel || deliveryParts || customerCount);

  return (
    <div className={`${BOX} ${className}`}>
      <BoxHeading>What you need to know</BoxHeading>

      {hasBody && (
        <div className="mt-4 flex flex-col gap-4">
          {minSpend && <StatTile icon={<WalletIcon />} value={minSpend} label="Minimum spend" />}
          {processingLabel && <StatTile icon={<CalendarIcon />} value={processingLabel} label="Orders processed" />}
          {deliveryParts && (
            <div className="flex items-start gap-2 text-sm text-muted">
              <TruckIcon />
              <span>
                Order by <strong className="font-semibold text-foreground">{deliveryParts.time}</strong>
                {', '}{deliveryParts.cutoffDayLabel} for delivery on{' '}
                <strong className="font-semibold text-foreground">{deliveryParts.dayName} {deliveryParts.dayOrdinal}</strong>
              </span>
            </div>
          )}
          {customerCount && <StatTile icon={<UsersIcon />} value={customerCount} label="Active customers" />}
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
  const { distributor, relationshipStatus, effectiveMinSpend } = useDistributor();

  if (isLoading) {
    return (
      <PageShell center>
        <PageSpinner />
      </PageShell>
    );
  }

  if (!user) return null;

  if (!distributor) {
    return (
      <PageShell center>
        <PageSpinner />
      </PageShell>
    );
  }

  const ctaKind = connectCtaKind(relationshipStatus);
  const hasAbout = Boolean(
    distributor.tagline || distributor.aboutText || distributor.logoUrl || ctaKind,
  );
  const hasContact = Boolean(
    distributor.email || distributor.phone ||
    distributor.addressLine1 || distributor.addressCity,
  );

  return (
    <PageShell width="full">
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] min-[1440px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">

        {hasAbout && (
          <AboutBox
            distributor={distributor}
            relationshipStatus={relationshipStatus}
            className="lg:col-start-1 lg:row-start-1"
          />
        )}

        <div className="flex flex-col gap-6 lg:col-start-2 lg:row-start-1 min-[1440px]:contents">
          <KeyInfo
            distributor={distributor}
            relationshipStatus={relationshipStatus}
            effectiveMinSpend={effectiveMinSpend}
            distributorSlug={distributorSlug}
            accessToken={accessToken}
            className="min-[1440px]:col-start-2 min-[1440px]:row-start-1"
          />

          {hasContact && (
            <GetInTouch distributor={distributor} className="min-[1440px]:col-start-3 min-[1440px]:row-start-1" />
          )}
        </div>
      </div>
    </PageShell>
  );
}
