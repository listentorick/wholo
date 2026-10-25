'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PlatformDistributor, PlatformStats, SupportGrant } from '@wholo/types';
import { StatTileFrame } from '@/components/dashboard/StatTile';
import { ListErrorBanner } from '@/components/list/ListErrorBanner';
import { ListSpinner } from '@/components/list/ListSpinner';
import { AccessEndedPanel } from './AccessEndedPanel';
import { OpenAccessDialog } from './OpenAccessDialog';
import { OrdersPerDayChart } from './OrdersPerDayChart';
import { opsApi } from './api';
import { enterWholesaler } from './navigation';
import { dismissEndedVisit, getEndedVisit, type EndedVisit } from './selection';
import { ATTENTION_LABELS, percentChange, toLookAt } from './shaping';
import { formatClock } from './time';

function Change({ current, previous }: { current: number; previous: number }) {
  const exact = percentChange(current, previous);
  if (exact === null) return <p className="text-xs font-medium text-muted">No orders the 30 days before</p>;
  const change = Math.round(exact);
  if (change === 0) return <p className="text-xs font-medium text-muted">No change vs. previous 30 days</p>;
  return (
    <p className={`text-xs font-medium ${change > 0 ? 'text-green-600' : 'text-red-600'}`}>
      {change > 0 ? '▲' : '▼'} {Math.abs(change)}% vs. previous 30 days
    </p>
  );
}

export function OpsHome() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [distributors, setDistributors] = useState<PlatformDistributor[]>([]);
  const [grants, setGrants] = useState<SupportGrant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState<EndedVisit | null>(() => getEndedVisit());
  const [opening, setOpening] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    Promise.all([opsApi.stats(), opsApi.distributors({ filter: 'attention' }), opsApi.myGrants()])
      .then(([s, d, g]) => {
        setStats(s);
        setDistributors(d);
        setGrants(g.filter((x) => x.status === 'ACTIVE'));
      })
      .catch(() => setError('Couldn’t load the platform dashboard. Please refresh.'));
  }, []);

  return (
    <>
      <h1 className="mb-6 text-xl font-semibold text-text">Platform</h1>

      {ended && (
        <AccessEndedPanel
          visit={ended}
          onOpenAgain={() => setOpening({ id: ended.distributorId, name: ended.name })}
          onDismiss={() => { dismissEndedVisit(); setEnded(null); }}
        />
      )}

      {grants.map((g) => (
        <div key={g.id} className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-support-border bg-support-soft p-4 text-support-text">
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">You have access to {g.distributorName}</span> until {formatClock(g.expiresAt)} · {g.reason}
          </p>
          <button type="button" onClick={() => enterWholesaler(g)} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary-hover">
            Continue
          </button>
        </div>
      ))}

      {error ? (
        <ListErrorBanner message={error} />
      ) : !stats ? (
        <ListSpinner />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTileFrame
              label="Wholesalers"
              value={stats.activeWholesalers.toLocaleString('en-GB')}
              footer={<p className="text-xs font-medium text-muted">{stats.wholesalersJoinedLast30Days} joined in 30 days</p>}
            />
            <StatTileFrame
              label="Trade customers ordering"
              value={stats.activeTradeCustomers.toLocaleString('en-GB')}
              footer={<p className="text-xs font-medium text-muted">Last 30 days</p>}
            />
            <StatTileFrame
              label="Orders"
              value={stats.ordersLast30Days.toLocaleString('en-GB')}
              footer={<Change current={stats.ordersLast30Days} previous={stats.ordersPrevious30Days} />}
            />
            <StatTileFrame
              label="Support access open"
              value={stats.openSupportGrants.toLocaleString('en-GB')}
              footer={<p className="text-xs font-medium text-muted">At {stats.wholesalersWithOpenSupport} wholesalers</p>}
            />
          </div>

          <section className="mt-6 rounded-lg border border-border bg-white p-4">
            <h2 className="text-sm font-semibold text-text">Orders per day, all wholesalers</h2>
            <div className="mt-3">
              <OrdersPerDayChart stats={stats} />
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-border bg-white">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-text">Wholesalers to look at</h2>
              <Link href="/ops/wholesalers" className="text-sm font-medium text-primary hover:text-primary-hover">
                All wholesalers
              </Link>
            </div>
            {toLookAt(distributors).length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Nothing needs a look right now.</p>
            ) : (
              <ul className="divide-y divide-border">
                {toLookAt(distributors).map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">{d.name}</p>
                      <p className="truncate text-xs text-muted">{d.attention.map((a) => ATTENTION_LABELS[a]).join(' · ')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpening({ id: d.id, name: d.name })}
                      className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-canvas"
                    >
                      Open…
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {opening && <OpenAccessDialog distributor={opening} onClose={() => setOpening(null)} />}
    </>
  );
}
