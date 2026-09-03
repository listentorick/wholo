'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Eyebrow } from '@/components/Eyebrow';
import { useAuth } from '@/lib/auth-context';
import { portalApi } from '@wholo/api-client';
import type { PortalRecommendedDistributor } from '@wholo/types';

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const ARROW =
  'flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted transition-colors hover:border-accent hover:text-accent';

function RecommendedCard({ distributor }: { distributor: PortalRecommendedDistributor }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(`/${distributor.slug}`)}
      className="group w-[190px] flex-shrink-0 rounded-lg border border-border bg-surface p-4 text-left shadow-sm transition-all duration-150 will-change-transform hover:-translate-y-1 hover:border-accent hover:shadow-md motion-reduce:hover:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-border bg-accent-light">
        {distributor.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={distributor.logoUrl}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <span className="text-xs font-semibold text-accent">{initials(distributor.name)}</span>
        )}
      </span>
      <p className="mt-3 truncate text-sm font-semibold text-foreground transition-colors group-hover:text-accent">
        {distributor.name}
      </p>
      {distributor.location && (
        <p className="mt-0.5 text-xs text-muted">{distributor.location}</p>
      )}
      {distributor.tagline && (
        <p className="mt-1 text-xs text-muted line-clamp-2">{distributor.tagline}</p>
      )}
    </button>
  );
}

/** Empty-state card — inert. There is no "invite a supplier" feature yet. */
function InviteSupplierCard() {
  return (
    <div className="flex w-[190px] flex-shrink-0 flex-col items-center gap-2 rounded-lg border border-dashed border-border p-4 text-center opacity-60">
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-border text-muted">
        <Plus className="h-5 w-5" aria-hidden />
      </span>
      <p className="text-xs text-muted">
        Buy from a wholesaler that isn&rsquo;t on Stocdup yet? Ask them to join and add you as a
        customer.
      </p>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="h-[132px] w-[190px] flex-shrink-0 animate-pulse rounded-lg border border-border bg-surface-hover" />
  );
}

type Status = 'loading' | 'ready' | 'error';

export function RecommendedSuppliers({ className }: { className?: string }) {
  const { accessToken } = useAuth();
  const [suppliers, setSuppliers] = useState<PortalRecommendedDistributor[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accessToken) return;
    setStatus('loading');
    portalApi
      .getRecommendedDistributors()
      .then((rows) => {
        setSuppliers(rows);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, [accessToken]);

  // A non-essential discovery panel — if the feed fails, drop it rather than
  // show a misleading empty/invite state (the home page has no error UI).
  if (status === 'error') return null;

  const showArrows = status === 'ready' && suppliers.length > 3;

  const scroll = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy?.({ left: dir * 220, behavior: 'smooth' });
  };

  return (
    <section
      className={clsx('hm-rise rounded-lg border border-border bg-surface p-5 shadow-sm', className)}
      style={{ animationDelay: '0.18s' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow className="mb-2">Marketplace</Eyebrow>
          <h2 className="text-base font-semibold text-foreground">Recommended suppliers</h2>
        </div>
        {showArrows && (
          <div className="flex flex-shrink-0 gap-1.5">
            <button type="button" aria-label="Scroll left" onClick={() => scroll(-1)} className={ARROW}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Scroll right" onClick={() => scroll(1)} className={ARROW}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {status === 'loading' ? (
        <div className="mt-4 flex gap-4 overflow-hidden">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : suppliers.length === 0 ? (
        <div className="mt-4 flex gap-4">
          <InviteSupplierCard />
        </div>
      ) : (
        <div
          ref={scrollRef}
          // Horizontal scroll forces overflow-y to clip too; the padding + matching
          // negative margin give the cards' hover lift + shadow room without shifting them.
          className="-mx-2 mt-3 flex gap-4 overflow-x-auto px-2 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {suppliers.map((d) => (
            <RecommendedCard key={d.id} distributor={d} />
          ))}
        </div>
      )}
    </section>
  );
}
