'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { DashboardBar, type DashboardNav } from './DashboardBar';
import { PeriodSelector } from './PeriodSelector';
import { StatTile } from './StatTile';
import { OrderTrendChart } from './OrderTrendChart';
import { ListTableShell } from '@/components/list/ListTableShell';
import { ListTh } from '@/components/list/ListTh';
import { adminAnalyticsApi } from '@wholo/admin-api-client';
import { getCurrencySymbol } from '@wholo/types';
import type {
  AnalyticsPeriodKey,
  CustomerRankingsResponse,
  OrderSummaryResponse,
  OrderTrendResponse,
  ProductRankingsResponse,
} from '@wholo/types';

const PERIOD_LABELS: Record<AnalyticsPeriodKey, string> = {
  today: 'yesterday',
  week: 'the same days last week',
  month: 'the same days last month',
  rolling7: 'the previous 7 days',
  rolling30: 'the previous 30 days',
  rolling90: 'the previous 90 days',
  rolling365: 'the previous 365 days',
  custom: 'the previous equivalent period',
};

function makeCurrencyFormatter(currencyCode: string) {
  return (value: number): string =>
    `${getCurrencySymbol(currencyCode)}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

interface DashboardData {
  summary: OrderSummaryResponse;
  trend: OrderTrendResponse;
  customers: CustomerRankingsResponse;
  products: ProductRankingsResponse;
}

// The commercial dashboard (order value, trend, top customers and products).
// What needs doing lives on the Delivery dashboard. Needs analytics:read; the page shell decides who sees it.
export function SalesDashboard({ nav }: { nav?: DashboardNav }) {
  const { user, accessToken } = useAuth();

  const [period, setPeriod] = useState<AnalyticsPeriodKey>('month');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (token: string, p: AnalyticsPeriodKey) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [summary, trend, customers, products] = await Promise.all([
        adminAnalyticsApi.orderSummary({ period: p }),
        adminAnalyticsApi.orderTrend({ period: p }),
        adminAnalyticsApi.customerRankings({ period: p, limit: 10 }),
        adminAnalyticsApi.productRankings({ period: p, limit: 10 }),
      ]);
      setData({ summary, trend, customers, products });
    } catch {
      setLoadError('Failed to load dashboard data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    load(accessToken, period);
  }, [accessToken, period, load]);

  if (!user) return null;

  const currencyCode = user.organisationCurrencyCode ?? 'GBP';
  const currency = makeCurrencyFormatter(currencyCode);
  const comparisonLabel = PERIOD_LABELS[period];
  return (
    <>
      <DashboardBar nav={nav} actions={<PeriodSelector period={period} onChange={setPeriod} />} />
      <div className="space-y-6">
        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{loadError}</div>
        )}

        {!data && isLoading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-canvas" />
            ))}
          </div>
        )}

        {data && (
          <div style={{ opacity: isLoading ? 0.6 : 1, transition: 'opacity 150ms' }}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatTile label="Order value" comparison={data.summary.metrics.orderValue} format={currency} />
              <StatTile label="Orders placed" comparison={data.summary.metrics.orderCount} />
              <StatTile label="Average order value" comparison={data.summary.metrics.averageOrderValue} format={currency} />
              <StatTile label="Purchasing customers" comparison={data.summary.metrics.purchasingCustomers} />
            </div>

            <div className="mt-6 rounded-lg border border-border bg-white p-5">
              <h2 className="mb-1 text-sm font-semibold text-text">Order value trend</h2>
              <p className="mb-4 text-xs text-muted">
                {data.summary.period.start} – {data.summary.period.end}, compared with {comparisonLabel}
              </p>
              <OrderTrendChart
                current={data.trend.current}
                comparison={data.trend.comparison}
                comparisonLabel={`vs. ${comparisonLabel}`}
                currencyCode={currencyCode}
              />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <h2 className="mb-3 text-sm font-semibold text-text">Top customers</h2>
                <ListTableShell>
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border">
                      <tr>
                        <ListTh>Customer</ListTh>
                        <ListTh className="text-right">Value</ListTh>
                        <ListTh className="text-right">Share</ListTh>
                      </tr>
                    </thead>
                    <tbody>
                      {data.customers.customers.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-5 py-6 text-center text-sm text-muted">No qualifying orders in this period.</td>
                        </tr>
                      )}
                      {data.customers.customers.map((c) => (
                        <tr key={c.customerId} className="border-b border-border last:border-0 hover:bg-canvas">
                          <td className="px-4 py-2.5">
                            <Link href={`/customers/${c.customerId}`} className="font-medium text-primary hover:underline">
                              {c.customerName}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-text">{currency(c.value)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                            {c.share !== null ? `${(c.share * 100).toFixed(0)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ListTableShell>
                {data.customers.top5Share !== null && (
                  <p className="mt-2 text-xs text-muted">Top 5 customers = {(data.customers.top5Share * 100).toFixed(0)}% of qualifying sales.</p>
                )}
              </div>

              <div>
                <h2 className="mb-3 text-sm font-semibold text-text">Top products</h2>
                <ListTableShell>
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border">
                      <tr>
                        <ListTh>Product</ListTh>
                        <ListTh className="text-right">Value</ListTh>
                        <ListTh className="text-right">Units</ListTh>
                        <ListTh className="text-right">Reach</ListTh>
                      </tr>
                    </thead>
                    <tbody>
                      {data.products.products.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-5 py-6 text-center text-sm text-muted">No qualifying sales in this period.</td>
                        </tr>
                      )}
                      {data.products.products.map((p) => (
                        <tr key={p.productId} className="border-b border-border last:border-0 hover:bg-canvas">
                          <td className="px-4 py-2.5">
                            <Link href={`/products/${p.productId}/edit`} className="font-medium text-primary hover:underline">
                              {p.productName}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-text">{currency(p.value)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted">{p.units}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted">{p.reach}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ListTableShell>
                {data.products.nonSellingProducts.length > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    {data.products.nonSellingProducts.length} enabled product(s) with no sales this period:{' '}
                    {data.products.nonSellingProducts.map((p, i) => (
                      <span key={p.productId}>
                        {i > 0 && ', '}
                        <Link href={`/products/${p.productId}/edit`} className="text-primary hover:underline">{p.productName}</Link>
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
