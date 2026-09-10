'use client';

import Link from 'next/link';

/** Inert account-level nav item — Discover / My Orders have no destination yet. */
function InertNavItem({ label }: { label: string }) {
  return (
    <span
      className="cursor-default text-sm text-muted/70"
      aria-disabled="true"
      title="Coming soon"
    >
      {label}
    </span>
  );
}

/**
 * The platform nav strip that sits under {@link PortalTopBar} on a distributor
 * storefront: a `My Suppliers / {distributor}` breadcrumb on the left, the
 * account-level links on the right. "Discover" and "My Orders" are inert
 * placeholders (no marketplace directory / cross-supplier order view exists yet).
 */
export function PlatformNavStrip({
  slug,
  distributorName,
}: {
  slug?: string;
  distributorName?: string | null;
}) {
  return (
    <nav className="flex h-11 items-center justify-between gap-4 border-b border-border bg-surface px-4 text-sm md:px-6">
      <span className="flex min-w-0 items-center gap-2">
        <Link href="/" className="flex-shrink-0 text-muted hover:text-foreground">
          My Suppliers
        </Link>
        {distributorName && (
          <>
            <span className="flex-shrink-0 text-muted/60" aria-hidden="true">
              /
            </span>
            {slug ? (
              <Link href={`/${slug}`} className="truncate font-semibold text-foreground hover:text-primary">
                {distributorName}
              </Link>
            ) : (
              <span className="truncate font-semibold text-foreground">{distributorName}</span>
            )}
          </>
        )}
      </span>

      <span className="flex flex-shrink-0 items-center gap-4">
        <InertNavItem label="Discover" />
        <InertNavItem label="My Orders" />
      </span>
    </nav>
  );
}
