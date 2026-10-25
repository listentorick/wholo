'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { opsApi } from './api';
import { OPS_BUILD_MARKER } from './marker';
import { endedCause, leaveWholesaler } from './navigation';
import { confirmSelection } from './scope';
import { getSelection, type WholesalerSelection } from './selection';
import { opsTitle } from './title';
import { ENDING_SOON_MINUTES, formatClock, formatDuration, minutesLeft } from './time';

/** Never ask apps/api again sooner than this, even if its clock runs a little behind. */
const RECHECK_MIN_MS = 5_000;

function pageName(pathname: string): string | undefined {
  const first = pathname.split('/').filter(Boolean)[0];
  if (!first) return 'Dashboard';
  return first.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * The amber bar across the top of every wholesaler screen in the Ops app: whose
 * account this is, why, and when access ends. Back to Ops keeps the access open;
 * End session ends it now. When time runs out the tab leaves by itself.
 */
export function SupportBar() {
  const [selection, setCurrent] = useState<WholesalerSelection | null>(() => getSelection());
  const [now, setNow] = useState(() => new Date());
  const [leaving, setLeaving] = useState(false);
  const [leaveFailed, setLeaveFailed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!selection) return;
    // The end time is apps/api's, not this tab's: when it comes (or the tab
    // regains focus) ask again, since the access may have been extended.
    // A refusal leaves the wholesaler through opsScope's error listener.
    async function recheck(atEnd: boolean) {
      // Leave only when apps/api says the access has ended; if it can't be
      // checked, stay — the next refused request leaves anyway.
      const check = await confirmSelection();
      const latest = getSelection();
      if (check.status === 'CONFIRMED' && latest) {
        if (atEnd || latest.expiresAt !== selection!.expiresAt) setCurrent(latest);
      } else if (check.status === 'ENDED' && latest) {
        leaveWholesaler(endedCause());
      }
    }
    const tick = setInterval(() => setNow(new Date()), 30_000);
    const end = setTimeout(() => recheck(true), Math.max(RECHECK_MIN_MS, new Date(selection.expiresAt).getTime() - Date.now()));
    const onFocus = () => recheck(false);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(tick);
      clearTimeout(end);
      window.removeEventListener('focus', onFocus);
    };
  }, [selection]);

  if (!selection) return null;

  const left = minutesLeft(selection.expiresAt, now);
  const endingSoon = left <= ENDING_SOON_MINUTES;

  // Leave only once apps/api has ended the access: leaving on a failure would
  // say the session ended while the grant stays open. (A refusal because it
  // already ended leaves through opsScope's error listener.)
  async function leave() {
    setLeaving(true);
    setLeaveFailed(false);
    try {
      await opsApi.endAccess(selection!.distributorId, selection!.grantId);
    } catch {
      setLeaving(false);
      setLeaveFailed(true);
      return;
    }
    leaveWholesaler('LEFT');
  }

  return (
    <div
      role="region"
      data-build={OPS_BUILD_MARKER}
      aria-label={`Stocdup support in ${selection.name}`}
      className="flex shrink-0 items-center gap-3 bg-support px-4 py-2 text-sm text-support-fg"
    >
      {/* React 19 hoists <title> into <head>; the tab says whose account this is. */}
      <title>{opsTitle(selection.name, pageName(pathname))}</title>
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-support-fg text-xs font-bold text-support"
      >
        {selection.name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {selection.name}
          <span className="hidden font-medium sm:inline"> · Stocdup support</span>
        </p>
        {leaveFailed ? (
          <p role="alert" className="truncate text-xs font-semibold">
            Couldn’t end the session. Try again.
          </p>
        ) : (
          <p className="hidden truncate text-xs sm:block" title={selection.reason}>
            {selection.reason}
          </p>
        )}
      </div>
      <p className="shrink-0 text-xs font-medium tabular-nums" aria-live="polite">
        <span className="hidden sm:inline">Access ends </span>
        {formatClock(selection.expiresAt)}
        {endingSoon && <span className="ml-1 font-bold">({formatDuration(left)} left)</span>}
      </p>
      <Link
        href="/ops"
        aria-label="Back to Ops"
        className="flex min-h-[44px] shrink-0 items-center rounded-md border border-support-fg/30 px-2.5 text-sm sm:px-3 font-semibold outline-none transition-colors hover:bg-support-fg/10 focus-visible:ring-2 focus-visible:ring-support-fg sm:min-h-[32px]"
      >
        <span className="sm:hidden">Ops</span>
        <span className="hidden sm:inline">Back to Ops</span>
      </Link>
      <button
        type="button"
        onClick={leave}
        disabled={leaving}
        className="min-h-[44px] shrink-0 rounded-md bg-support-fg px-3 text-sm font-semibold text-white sm:px-4 outline-none focus-visible:ring-2 focus-visible:ring-support-fg focus-visible:ring-offset-2 focus-visible:ring-offset-support disabled:opacity-60 sm:min-h-[32px]"
      >
        {leaving ? 'Ending…' : 'End session'}
      </button>
    </div>
  );
}
