'use client';

import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

const widthClasses = {
  /** 480px commerce shell — product lists, orders, checkout */
  narrow: 'max-w-[480px] mx-auto',
  /** reading column — home */
  reading: 'max-w-3xl mx-auto',
  /** wide column — about */
  wide: 'max-w-4xl mx-auto',
  /** no cap — settings */
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
 * Base page container for all portal screens. Owns the flex-column fill
 * (so short pages stretch to the viewport and document scroll behaves the
 * same everywhere), the centered max-width shell, and standard padding.
 * Full-width chrome (PageSubHeader, sticky tab bars) must stay outside it.
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
      className="h-7 w-7 animate-spin rounded-full border-2 border-[#D97036] border-t-transparent"
    />
  );
}
