'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminTeamApi } from '@wholo/admin-api-client';
import type { SupportGrant } from '@wholo/types';
import { useSupportPresence } from '@/lib/support-presence-context';
import { TeamConfirmDialog } from './TeamConfirmDialog';
import { endedLabel, formatMinutes, formatUntil, formatWhen, visitMinutes } from './support-access';

function changesText(count: number | undefined): string {
  if (count === undefined) return '';
  return count === 1 ? '1 recorded change' : `${count} recorded changes`;
}

/**
 * Stocdup support access to this distributor, for the Owner (ADR-078): the
 * visit in progress, with End access, and past visits with how each ended.
 */
export function SupportAccessSection() {
  const [grants, setGrants] = useState<SupportGrant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState<SupportGrant | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const presence = useSupportPresence();

  const load = useCallback(async () => {
    try {
      setGrants(await adminTeamApi.supportGrants());
      setError(null);
    } catch {
      setError('Couldn’t load Stocdup support access.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function endAccess() {
    if (!ending) return;
    setSubmitting(true);
    setEndError(null);
    try {
      await adminTeamApi.endSupportGrant(ending.id);
      setEnding(null);
      await Promise.all([load(), presence.refresh()]);
    } catch {
      setEndError('Couldn’t end access. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const active = grants?.filter((g) => g.status === 'ACTIVE') ?? [];
  const past = grants?.filter((g) => g.status !== 'ACTIVE') ?? [];

  return (
    <section id="support-access" aria-labelledby="support-access-title" className="mt-8">
      <h2 id="support-access-title" className="text-base font-semibold text-text">
        Stocdup support access
      </h2>
      <p className="mt-1 text-sm text-muted">
        When you ask Stocdup for help, a support person can open your account for a few hours. They act as themselves, every visit is listed
        here, and you can end one at any time.
      </p>

      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

      {active.map((g) => (
        <div key={g.id} className="mt-4 rounded-lg border border-support-border bg-support-soft p-4 text-support-text">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {g.holder.name} is in your account until {formatUntil(g.expiresAt)}
              </p>
              <p className="mt-1 text-sm">{g.reason}</p>
              <p className="mt-1 text-xs">
                Opened {formatWhen(g.startsAt)}
                {g.changeCount !== undefined && ` · ${changesText(g.changeCount)} so far`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setEndError(null); setEnding(g); }}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              End access
            </button>
          </div>
        </div>
      ))}

      {grants && past.length === 0 && active.length === 0 && (
        <p className="mt-4 rounded-lg border border-border bg-white px-5 py-6 text-center text-sm text-muted">Stocdup support has never opened your account.</p>
      )}

      {past.length > 0 && (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-white">
          {past.map((g) => (
            <li key={g.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="font-medium text-text">{g.holder.name}</span>
              <span className="text-muted">{formatWhen(g.startsAt)} · {formatMinutes(visitMinutes(g))}</span>
              <span className="min-w-0 flex-1 truncate text-muted" title={g.reason}>{g.reason}</span>
              <span className="text-muted">{changesText(g.changeCount)}</span>
              <span className="text-xs font-medium text-muted">{endedLabel(g)}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-xs text-muted">Recorded changes count order, delivery and accounting actions.</p>

      {ending && (
        <TeamConfirmDialog
          title={`End ${ending.holder.name}’s access?`}
          description="Stocdup support leaves your account straight away. They can only come back by opening access again, which you will see here."
          confirmLabel="End access"
          busyLabel="Ending…"
          submitting={submitting}
          error={endError}
          onCancel={() => setEnding(null)}
          onConfirm={endAccess}
        />
      )}
    </section>
  );
}
