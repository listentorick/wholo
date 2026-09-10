'use client';

import Link from 'next/link';
import { Wordmark } from './Wordmark';

/**
 * Global footer for the storefront layout. Deliberately minimal — the design
 * mock's marketing columns point at pages that don't exist yet, so this carries
 * only the wordmark, the two links that do resolve, and the legal line.
 */
export function PortalFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-8">
        <Wordmark markSize={24} textClassName="text-base" />

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
          <Link href="/" className="hover:text-foreground">
            My Suppliers
          </Link>
          <Link href="/settings" className="hover:text-foreground">
            Settings
          </Link>
        </nav>

        <p className="text-sm text-muted">&copy; {new Date().getFullYear()} Stocdup</p>
      </div>
    </footer>
  );
}
