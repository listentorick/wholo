'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupportGrant } from '@wholo/types';
import { ListErrorBanner } from '@/components/list/ListErrorBanner';
import { ListPageHeader } from '@/components/list/ListPageHeader';
import { ListSpinner } from '@/components/list/ListSpinner';
import { opsApi } from './api';
import { enterWholesaler, leaveWholesaler } from './navigation';
import { getSelection } from './selection';
import { formatClock } from './time';

const dayAndTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function howItEnded(g: SupportGrant): string {
  if (g.status === 'EXPIRED') return 'Time ran out';
  if (g.endedBy === 'HOLDER') return 'You ended it';
  if (g.endedBy === 'DISTRIBUTOR') return 'Ended by the wholesaler';
  return 'Ended by another operator';
}

/** The operator's own support access: open now (Continue / End now), then recent visits. */
export function MyAccessPage() {
  const [grants, setGrants] = useState<SupportGrant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    opsApi
      .myGrants()
      .then((g) => {
        setGrants(g);
        setError(null);
      })
      .catch(() => setError('Couldn’t load your access. Please refresh.'));
  }, []);

  useEffect(load, [load]);

  async function endNow(g: SupportGrant) {
    setBusy(g.id);
    try {
      await opsApi.endAccess(g.distributorId, g.id);
      // Ending the visit this tab is in leaves it as End session does, with a
      // reload, so nothing still thinks it is inside that wholesaler.
      if (getSelection()?.grantId === g.id) {
        leaveWholesaler('LEFT');
        return;
      }
      load();
    } catch {
      setError('Couldn’t end access. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  const active = grants?.filter((g) => g.status === 'ACTIVE') ?? [];
  const past = grants?.filter((g) => g.status !== 'ACTIVE') ?? [];

  return (
    <>
      <ListPageHeader title="My access" />
      {error && <ListErrorBanner message={error} />}
      {!grants ? (
        !error && <ListSpinner />
      ) : (
        <>
          <h2 className="mb-2 text-sm font-semibold text-text">Open now</h2>
          {active.length === 0 ? (
            <p className="rounded-lg border border-border bg-white px-5 py-6 text-center text-sm text-muted">You have no access open.</p>
          ) : (
            <ul className="space-y-2">
              {active.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-support-border bg-support-soft p-4 text-support-text">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{g.distributorName}</p>
                    <p className="truncate text-xs">Until {formatClock(g.expiresAt)} · {g.reason}</p>
                  </div>
                  <button type="button" onClick={() => enterWholesaler(g)} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary-hover">
                    Continue
                  </button>
                  <button
                    type="button"
                    onClick={() => endNow(g)}
                    disabled={busy === g.id}
                    className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {busy === g.id ? 'Ending…' : 'End now'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mb-2 mt-8 text-sm font-semibold text-text">Recent</h2>
          {past.length === 0 ? (
            <p className="rounded-lg border border-border bg-white px-5 py-6 text-center text-sm text-muted">No earlier visits.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-white">
              {past.map((g) => (
                <li key={g.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <span className="font-medium text-text">{g.distributorName}</span>
                  <span className="text-muted">{dayAndTime.format(new Date(g.startsAt))}</span>
                  <span className="min-w-0 flex-1 truncate text-muted" title={g.reason}>{g.reason}</span>
                  <span className="text-xs font-medium text-muted">{howItEnded(g)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
