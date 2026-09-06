'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Compass } from 'lucide-react';
import { PageShell } from '@/components/PageShell';

/**
 * Rendered when `[distributorSlug]/layout.tsx` calls `notFound()`. Lives at the app
 * root rather than beside that layout: Next.js resolves a `notFound()` thrown from a
 * segment's own layout against the PARENT segment's not-found boundary (the segment's
 * layout is what failed, so it can't also wrap a sibling not-found.tsx) — since
 * `[distributorSlug]` sits directly under `app/`, this is that parent. Next.js also
 * doesn't pass route params to a not-found boundary, so the attempted slug is read
 * back via `useParams()` instead (still populated from the matched route). Standalone,
 * deliberately not wrapped in DistributorShell — there's no distributor to hang that
 * chrome off. Full-page navy rather than a boxed PromoBanner card — this page IS the
 * dark surface, so its headline/eyebrow markup is hand-rolled here instead of going
 * through PromoBanner (which stays light-canvas-agnostic for its other consumer, the
 * portal home page).
 */
export default function DistributorNotFound() {
  const { distributorSlug } = useParams<{ distributorSlug: string }>();

  return (
    <div className="flex min-h-screen flex-col bg-navy">
      <PageShell width="full" className="flex-1 items-center">
        <div className="mt-10 flex items-center justify-center gap-2.5 sm:mt-14">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/stocdup-logo-only-white.png" alt="" className="h-10 w-10" />
          <span className="text-2xl font-extrabold tracking-tight text-on-navy">
            stocd<span className="text-primary">up</span>
          </span>
        </div>

        <div className="flex w-full flex-1 items-center justify-center">
          <div className="flex w-full max-w-[560px] flex-col items-center text-center">
            <p className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-on-navy-muted">
              <span aria-hidden className="h-1 w-[22px] rounded-full bg-amber" />
              Page not found
            </p>
            <h1 className="mt-3.5 text-[28px] font-extrabold uppercase leading-[0.98] tracking-[-0.02em] text-on-navy sm:text-[38px]">
              We can&rsquo;t find that
              <br />
              <span className="box-decoration-clone bg-amber px-[0.1em] text-amber-fg">supplier</span>
            </h1>
            <p className="mt-3.5 max-w-sm text-sm leading-relaxed text-on-navy-muted">
              The link{' '}
              <code className="rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 font-mono text-[12.5px] text-on-navy">
                /{distributorSlug}
              </code>{' '}
              doesn&rsquo;t match any of our suppliers. It may be mistyped, or the account may no longer be active.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg hover:bg-primary-hover"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Go to Your Suppliers
              </Link>
              <div
                title="Coming soon"
                className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-medium text-on-navy-muted"
              >
                <Compass className="h-4 w-4" aria-hidden />
                Browse marketplace
              </div>
            </div>
            <p className="mt-4 text-xs text-on-navy-muted">Think this is a mistake? Contact support.</p>
          </div>
        </div>
      </PageShell>
    </div>
  );
}
