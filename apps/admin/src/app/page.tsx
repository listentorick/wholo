'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { PeriodSelector } from '@/components/dashboard/PeriodSelector';
import { StatTile } from '@/components/dashboard/StatTile';
import { OrderTrendChart } from '@/components/dashboard/OrderTrendChart';
import { ListTableShell } from '@/components/list/ListTableShell';
import { ListTh } from '@/components/list/ListTh';
import { adminAnalyticsApi } from '@wholo/admin-api-client';
import type {
  ActionItemsResponse,
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

function currency(value: number): string {
  return `£${value.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

interface DashboardData {
  summary: OrderSummaryResponse;
  trend: OrderTrendResponse;
  customers: CustomerRankingsResponse;
  products: ProductRankingsResponse;
  actionItems: ActionItemsResponse;
}

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  const [period, setPeriod] = useState<AnalyticsPeriodKey>('month');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (token: string, p: AnalyticsPeriodKey) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [summary, trend, customers, products, actionItems] = await Promise.all([
        adminAnalyticsApi.orderSummary({ period: p }, token),
        adminAnalyticsApi.orderTrend({ period: p }, token),
        adminAnalyticsApi.customerRankings({ period: p, limit: 10 }, token),
        adminAnalyticsApi.productRankings({ period: p, limit: 10 }, token),
        adminAnalyticsApi.actionItems(token),
      ]);
      setData({ summary, trend, customers, products, actionItems });
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

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'hsl(var(--color-primary))' }} />
      </div>
    );
  }
  if (!user) return null;

  const comparisonLabel = PERIOD_LABELS[period];
  const actionItemCount = data
    ? data.actionItems.awaitingAcceptance.length + data.actionItems.dueForFulfilment.length + data.actionItems.invoiceFailures.length
    : 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-text">Welcome back, {user.firstName}</h1>
            <p className="mt-1 text-sm text-muted">{user.organisationName}</p>
          </div>
          <PeriodSelector period={period} onChange={setPeriod} />
        </div>

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
              <OrderTrendChart current={data.trend.current} comparison={data.trend.comparison} comparisonLabel={`vs. ${comparisonLabel}`} />
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
                            <Link href={`/products/${p.productId}`} className="font-medium text-primary hover:underline">
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
                        <Link href={`/products/${p.productId}`} className="text-primary hover:underline">{p.productName}</Link>
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6">
              <h2 className="mb-3 text-sm font-semibold text-text">
                Needs attention {actionItemCount > 0 && <span className="text-muted font-normal">({actionItemCount})</span>}
              </h2>
              <ListTableShell>
                {actionItemCount === 0 && data.actionItems.neverOrdered.length === 0 && (
                  <p className="px-5 py-6 text-center text-sm text-muted">Nothing needs attention right now.</p>
                )}
                <ul className="divide-y divide-border">
                  {data.actionItems.awaitingAcceptance.map((o) => (
                    <li key={o.id} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-canvas">
                      <span className="text-text">Order <Link href={`/orders/${o.id}`} className="font-medium text-primary hover:underline">{o.orderNumber}</Link> awaiting acceptance</span>
                      <span className="tabular-nums text-muted">{o.totalAmount}</span>
                    </li>
                  ))}
                  {data.actionItems.dueForFulfilment.map((o) => (
                    <li key={o.id} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-canvas">
                      <span className="text-text">Order <Link href={`/orders/${o.id}`} className="font-medium text-primary hover:underline">{o.orderNumber}</Link> due for fulfilment</span>
                      <span className="tabular-nums text-muted">{o.totalAmount}</span>
                    </li>
                  ))}
                  {data.actionItems.invoiceFailures.map((f) => (
                    <li key={f.id} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-canvas">
                      <span className="text-text">
                        Invoice failed for order <Link href={`/orders/${f.orderId}`} className="font-medium text-primary hover:underline">{f.orderId}</Link>
                      </span>
                      <span className="text-red-600">{f.errorCode}</span>
                    </li>
                  ))}
                  {data.actionItems.neverOrdered.map((c) => (
                    <li key={c.customerId} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-canvas">
                      <span className="text-text">
                        <Link href={`/customers/${c.customerId}`} className="font-medium text-primary hover:underline">{c.customerName}</Link> has never placed an order
                      </span>
                    </li>
                  ))}
                </ul>
              </ListTableShell>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
