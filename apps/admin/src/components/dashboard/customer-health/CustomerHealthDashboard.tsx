'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useCustomerHealth } from '@/lib/hooks/use-customer-health';
import { DashboardBar, type DashboardNav } from '../DashboardBar';
import { RefreshButton } from '../RefreshButton';
import { makeCurrencyFormatter } from '../currency';
import { HealthStatTiles } from './HealthStatTiles';
import { HealthTierBar } from './HealthTierBar';
import { NeedingAttentionTable } from './NeedingAttentionTable';
import { BuyingTrendsChart } from './BuyingTrendsChart';
import { SalesConcentrationChart } from './SalesConcentrationChart';

// Spotting at-risk trade customers before they churn: ordering regularity,
// spend trend, delivery reliability, never-ordered relationships, rejected/
// cancelled orders and product-range narrowing — each surfaced as an
// explicit reason (see apps/api/src/customer-health/customer-health.logic.ts).
// One of the home dashboard's tabs (Delivery | Customers | Sales): fetched once
// and refreshed manually, since nothing here is a minute-to-minute read.
export function CustomerHealthDashboard({ nav }: { nav?: DashboardNav }) {
  const { user, accessToken } = useAuth();
  const { data, isLoading, isRefreshing, error, refetch } = useCustomerHealth(!!accessToken);
  const [riskOnly, setRiskOnly] = useState(false);

  if (!user) return null;
  const currency = makeCurrencyFormatter(user.organisationCurrencyCode ?? 'GBP');

  if (!data) {
    if (error) {
      return (
        <div>
          <DashboardBar nav={nav} />
          <div className="space-y-3">
            <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
            <button type="button" onClick={refetch} className="text-sm font-medium text-primary hover:underline">Try again</button>
          </div>
        </div>
      );
    }
    return (
      <div>
        <DashboardBar nav={nav} />
        <div className="space-y-4" aria-busy={isLoading} aria-label="Loading customer health">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-canvas" />)}
          </div>
          <div className="h-64 animate-pulse rounded-lg border border-border bg-canvas" />
        </div>
      </div>
    );
  }

  const controls = <RefreshButton onClick={refetch} isRefreshing={isRefreshing} />;

  return (
    <div>
      <DashboardBar nav={nav} actions={controls} />
      <div className="space-y-4 lg:space-y-6">
        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">Could not refresh — showing the last loaded data.</div>
        )}

        <HealthStatTiles tiles={data.tiles} riskOnly={riskOnly} onToggleRisk={() => setRiskOnly((v) => !v)} currency={currency} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <div className="lg:col-span-2">
            <NeedingAttentionTable customers={data.needingAttention} riskOnly={riskOnly} currency={currency} />
          </div>
          <HealthTierBar counts={data.tierCounts} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <div className="lg:col-span-2">
            <BuyingTrendsChart weeks={data.buyingTrends} />
          </div>
          <SalesConcentrationChart sales={data.salesConcentration} currency={currency} />
        </div>
      </div>
    </div>
  );
}
