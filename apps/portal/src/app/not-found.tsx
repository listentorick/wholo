'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { PromoBanner } from '@/components/PromoBanner';

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
      <PageShell width="full" className="flex-1 items-center">
        <div className="mt-10 flex items-center gap-2.5 sm:mt-14">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/stocdup-logo-only.png" alt="" className="h-10 w-10" />
          <span className="text-2xl font-extrabold tracking-tight text-foreground">
            stocd<span className="text-primary">up</span>
          </span>
        </div>

        <div className="flex w-full flex-1 items-center justify-center">
          <PromoBanner
            className="w-full max-w-[560px]"
            headline={
              <>
                We can&rsquo;t find that
                <br />
                <span className="box-decoration-clone bg-amber px-[0.1em] text-amber-fg">supplier</span>
              </>
            }
            body={
              <>
                The link{' '}
                <code className="rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 font-mono text-[12.5px] text-on-navy">
                  /{distributorSlug}
                </code>{' '}
                doesn&rsquo;t match any of our suppliers. It may be mistyped, or the account may no longer be active.
              </>
            }
            cta={
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg hover:bg-primary-hover"
              >
                Go to Your Suppliers
              </Link>
            }
          />
        </div>
      </PageShell>
    </div>
  );
}
