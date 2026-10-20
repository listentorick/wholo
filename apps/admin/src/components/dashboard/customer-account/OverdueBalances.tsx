'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CustomerPaymentSummary } from '@wholo/types';
import { useEChart } from '@/lib/hooks/use-echart';
import { makeCurrencyFormatter } from '../currency';
import { buildOverdueHistoryOption, overdueHistorySummary } from './accountChartOptions';
import { AGEING_META, formatMoneyAmounts, NOT_ENOUGH_HISTORY, plural, shortDate } from './customer-account';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface Props {
  overdue: CustomerPaymentSummary['overdue'];
  history: CustomerPaymentSummary['overdueHistory'];
  distributorCurrency: string;
}

// What was overdue each day, stacked by how long past due.
function OverdueHistoryChart({ history }: { history: CustomerPaymentSummary['overdueHistory'] }) {
  const { containerRef, chartRef } = useEChart();

  useEffect(() => {
    chartRef.current?.setOption(buildOverdueHistoryOption(history), true);
  }, [history, chartRef]);

  return <div ref={containerRef} role="img" aria-label={overdueHistorySummary(history)} className="h-44 w-full" />;
}

// Part of "How do they pay?": what was overdue over time and today, by how
// long past due, and the invoice to chase first.
export function OverdueBalances({ overdue, history, distributorCurrency }: Props) {
  const oldest = overdue.oldest;
  // The window is 90 days; a later first day means facts only began then.
  const partial = history.since !== null && history.days.length < 90;

  return (
    <section className="flex flex-col border-t border-border pt-5" aria-labelledby="overdue-heading">
      <h3 id="overdue-heading" className="text-sm font-semibold text-text">Overdue balances</h3>
      <p className="mt-0.5 text-xs text-muted">
        {overdue.count === 0
          ? 'Nothing overdue.'
          : `${formatMoneyAmounts(overdue.amounts, distributorCurrency)} overdue on ${plural(overdue.count, 'invoice')}, by days past due.`}
      </p>

      <div className="mt-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
          {partial ? `Each day since ${shortDate(history.since)}` : 'Each day, last 90 days'}
        </p>
        {history.days.length < 2 ? (
          <div className="flex h-44 items-center justify-center rounded-md bg-canvas text-xs text-muted">{NOT_ENOUGH_HISTORY}</div>
        ) : (
          <OverdueHistoryChart history={history} />
        )}
      </div>

      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">Today</p>
      <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {overdue.ageing.map((band) => (
          <div key={band.bucket}>
            <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: AGEING_META[band.bucket].colour }} aria-hidden="true" />
              {AGEING_META[band.bucket].label}
            </dt>
            <dd className={`mt-1 text-lg font-semibold ${band.count === 0 ? 'text-muted' : 'text-text'}`}>
              {formatMoneyAmounts(band.amounts, distributorCurrency)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex items-center justify-between gap-2">
        {oldest ? (
          <>
            <span className="text-xs text-muted">
              Oldest overdue ·{' '}
              <Link href={`/orders/${oldest.orderId}`} className="font-medium text-primary hover:underline">
                {oldest.externalInvoiceNumber ?? oldest.orderNumber}
              </Link>
            </span>
            <span className="text-sm font-semibold text-red-700">
              {makeCurrencyFormatter(oldest.currency)(oldest.amountDue)} · {plural(oldest.daysOverdue, 'day')}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted">No overdue invoices</span>
        )}
      </div>
    </section>
  );
}
