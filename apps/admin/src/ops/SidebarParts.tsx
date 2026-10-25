'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { OPS_BUILD_MARKER } from './marker';
import { getSelection } from './selection';

export function OpsLogoTag() {
  return (
    <span data-build={OPS_BUILD_MARKER} className="rounded bg-support px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-support-fg">
      OPS
    </span>
  );
}

export function OpsSidebarNote() {
  const [selection] = useState(() => getSelection());
  if (!selection) return null;
  return <p data-build={OPS_BUILD_MARKER} className="shrink-0 border-t border-sidebar-border px-6 py-3 text-[11px] leading-snug text-sidebar-fg/50">Team, and connecting or disconnecting accounting, are not available with support access.</p>;
}

/** At the top of every dialog inside a wholesaler: which account the action is for. */
export function OpsDialogChip() {
  const [selection] = useState(() => getSelection());
  const pathname = usePathname();
  // The Ops pages themselves are not inside the wholesaler.
  if (!selection || pathname.startsWith('/ops')) return null;
  return (
    <p
      data-build={OPS_BUILD_MARKER}
      className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-support-border bg-support-soft px-2.5 py-0.5 text-xs font-semibold text-support-text"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-support" />
      {selection.name} · Stocdup support
    </p>
  );
}
