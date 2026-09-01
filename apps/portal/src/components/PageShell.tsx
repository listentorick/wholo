'use client';

import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

const widthClasses = {
  /** 480px centred column — narrow forms / single-column flows */
  narrow: 'max-w-[480px] mx-auto',
  /** reading column — prose-led pages */
  reading: 'max-w-3xl mx-auto',
  /** wide column — prose-led pages that need more room */
  wide: 'max-w-4xl mx-auto',
  /**
   * No cap — the standard for every top-level distributor page (home,
   * catalogue, product detail, orders, order detail, checkout). Content fills
   * the space beside the sidebar; the page manages its own internal grid.
   */
  full: '',
} as const;

interface PageShellProps {
  children: React.ReactNode;
  /** Centered column width. Defaults to the 480px commerce shell. */
  width?: keyof typeof widthClasses;
  /** 'none' for full-bleed pages that manage their own padding. */
  padding?: 'default' | 'none';
  /** Fill the viewport and center content — loading spinners, empty/error states. */
  center?: boolean;
  /** Per-page extras, e.g. 'pb-12'. */
  className?: string;
}

/**
 * The single page-container primitive for every portal screen. Owns the
 * flex-column fill (so short pages stretch to the viewport and document scroll
 * behaves the same everywhere), the optional centred max-width, and the standard
 * 20px page padding.
 *
 * The contract for top-level distributor pages: pass `width="full"` and keep the
 * default padding — never `padding="none"` with hand-rolled `px-*` / `mx-auto` /
 * `max-w-*` wrappers inside. That opt-out is what made every page look bespoke;
 * `padding="none"` now exists only for the `center` loading/error states.
 * Full-width chrome (PageSubHeader, sticky tab bars) stays outside the shell.
 */
export function PageShell({
  children,
  width = 'narrow',
  padding = 'default',
  center = false,
  className,
}: PageShellProps) {
  return (
    <div
      className={twMerge(
        clsx(
          'flex w-full flex-1 flex-col min-w-0',
          widthClasses[width],
          padding === 'default' && 'p-5',
          center && 'items-center justify-center',
        ),
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageSpinner() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent"
    />
  );
}
