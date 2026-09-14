'use client';

import { useEffect, useRef } from 'react';
import { MessageSquare } from 'lucide-react';
import type { DistributorInfo } from '@wholo/types';
import type { RelationshipStatus } from '@/lib/distributor-context';
import { useViewerOrderCount } from '@/lib/hooks/use-viewer-order-count';
import { RelationshipCta } from './RelationshipCta';

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-3.5 w-3.5 flex-shrink-0">
      <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

interface Props {
  distributor: DistributorInfo;
  relationshipStatus: RelationshipStatus | null;
  /** Fires when the header scrolls up behind the sticky block → reveal the condensed header. */
  onScrolledPast: (past: boolean) => void;
}

/**
 * The full distributor identity block below the cover banner: round logo, name,
 * location · tagline, the viewer's order count, an inert "Message" action and the
 * relationship CTA. Its bottom edge carries the sentinel that toggles the
 * condensed sticky header.
 */
export function ShopHeader({ distributor, relationshipStatus, onScrolledPast }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const orderCount = useViewerOrderCount(distributor.slug);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    // Geometry only — not `entry.isIntersecting`, which is ambiguous for a
    // genuinely zero-height/zero-area sentinel right at the crossing point.
    // The `< 2` tolerance (not a strict `< 0`) absorbs a landing jump that
    // settles the sentinel a px or two short of exactly 0 — the same
    // "couple of px" rationale `use-scroll-spy.ts`'s own boundary check
    // uses. Without it, a target that sits immediately after the sticky
    // stack (no section/content between them) lands the sentinel at exactly
    // `top: 0`, which used to read as "not yet scrolled past".
    const observer = new IntersectionObserver(
      ([entry]) => onScrolledPast(entry.boundingClientRect.top < 2),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      onScrolledPast(false);
    };
  }, [onScrolledPast]);

  const location = [distributor.addressCity, distributor.addressCountry].filter(Boolean).join(', ');

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 pb-5 pt-5 md:flex-row md:items-center md:gap-5 md:px-8">
        {/* Logo + identity: always a row (beside, not below); `md:contents`
            dissolves this wrapper on desktop so the logo, the text block and the
            actions share one flex row. */}
        <div className="flex items-center gap-4 md:contents">
          <span className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface shadow-sm md:h-20 md:w-20">
            {distributor.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={distributor.logoUrl} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <span className="text-lg font-extrabold tracking-tight text-muted">
                {distributor.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight tracking-[-0.02em] text-foreground md:text-2xl">
              {distributor.name}
            </h1>
            {(location || distributor.tagline) && (
              <p className="mt-1 text-sm leading-snug text-muted">
                {location && (
                  <span className="inline-flex items-center gap-1 align-middle">
                    <MapPinIcon />
                    {location}
                  </span>
                )}
                {location && distributor.tagline && <span className="mx-1.5">&middot;</span>}
                {distributor.tagline && <span>{distributor.tagline}</span>}
              </p>
            )}
            {orderCount != null && orderCount > 0 && (
              <p className="mt-1 text-sm text-muted">
                {orderCount} {orderCount === 1 ? 'order' : 'orders'} with this supplier
              </p>
            )}
          </div>
        </div>

        <div className="flex w-full items-center gap-2.5 md:w-auto md:flex-shrink-0">
          <button
            type="button"
            disabled
            title="Coming soon"
            className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground opacity-60 md:flex-none"
          >
            <MessageSquare className="h-4 w-4" strokeWidth={1.7} />
            Message
          </button>
          <RelationshipCta
            distributorName={distributor.name}
            relationshipStatus={relationshipStatus}
            variant="header"
          />
        </div>
      </div>
      <div ref={sentinelRef} aria-hidden="true" className="h-0 w-full" />
    </>
  );
}
