'use client';

import clsx from 'clsx';
import { Search } from 'lucide-react';

/**
 * The platform-wide search field from the storefront design. Cross-surface
 * product/supplier/order search is a greenfield feature, so this is a
 * deliberately inert stand-in — a styled `<div>`, never an `<input>`, so it
 * cannot be focused, typed into, or submitted. Mirrors the home page's
 * `SupplierSearchPlaceholder`.
 */
export function PlatformSearchPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2.5 rounded-md border border-border bg-surface px-3.5 py-2 text-sm text-muted',
        className,
      )}
      aria-hidden="true"
    >
      <Search className="h-4 w-4 flex-shrink-0" strokeWidth={1.8} />
      <span className="truncate">Search Stocdup &mdash; products, suppliers, orders</span>
    </div>
  );
}
