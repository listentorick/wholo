'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Eyebrow } from '@/components/Eyebrow';
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
 * chrome off.
 */
export default function DistributorNotFound() {
  const { distributorSlug } = useParams<{ distributorSlug: string }>();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PageShell center width="narrow" className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/stocdup-logo-only.png" alt="" className="h-10 w-10" />
        <span className="mt-3 text-2xl font-extrabold tracking-tight text-foreground">
          stocd<span className="text-primary">up</span>
        </span>

        <div className="mt-8 flex flex-col items-center">
          <Eyebrow>Page not found</Eyebrow>
          <h1 className="mt-5 text-[44px] font-bold leading-[1.15] tracking-tight text-foreground">
            We can&rsquo;t find that <span className="text-amber">supplier</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            The link{' '}
            <code className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">
              /{distributorSlug}
            </code>{' '}
            doesn&rsquo;t match any of our suppliers. It may be mistyped, or the account may no longer be active.
          </p>

          <Link
            href="/"
            className="mt-7 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg hover:bg-primary-hover"
          >
            Go to Your Suppliers
          </Link>
        </div>
      </PageShell>
    </div>
  );
}
