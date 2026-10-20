'use client';

import { useEffect } from 'react';
import * as echarts from 'echarts/core';
import { CustomChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { Customer, CustomerInvoiceTimelineEntry, CustomerPaymentSummary } from '@wholo/types';
import { useEChart } from '@/lib/hooks/use-echart';
import { ChartLegend } from '../ChartLegend';
import { buildInvoiceTimelineOption, invoiceTimelineSummary, timelineBars, timelineInvoices, timelineLegend } from './accountChartOptions';
import { AccountSection, MetricTiles, type MetricTileConfig } from './AccountSection';
import { OverdueBalances } from './OverdueBalances';
import { paidByDueDate, paymentTrendText, plural } from './customer-account';

echarts.use([CustomChart, GridComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);

const ROW_HEIGHT = 32;
const AXIS_HEIGHT = 52;

// Each raised invoice: when it was ordered, when it was due by under its terms, and when (or whether) it was paid.
function InvoiceTimeline({ entries, today }: { entries: CustomerInvoiceTimelineEntry[]; today: string }) {
  const { containerRef, chartRef } = useEChart();
  const rows = timelineInvoices(entries);
  const legend = timelineLegend(timelineBars(entries, today));

  useEffect(() => {
    chartRef.current?.setOption(buildInvoiceTimelineOption(entries, today), true);
  }, [entries, today, chartRef]);

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
        {rows.length < entries.length ? `Invoices: ordered, due by and paid · latest ${rows.length}` : 'Invoices: ordered, due by and paid'}
      </p>
      <ChartLegend items={legend.map((i) => ({ label: i.label, color: i.colour, variant: i.variant }))} />
      {/* A phone scrolls the chart sideways rather than squeezing the dates together. */}
      <div className="overflow-x-auto">
        <div
          ref={containerRef}
          role="img"
          aria-label={invoiceTimelineSummary(entries)}
          className="w-full min-w-[640px]"
          style={{ height: rows.length * ROW_HEIGHT + AXIS_HEIGHT }}
        />
      </div>
    </div>
  );
}

interface Props {
  summary: CustomerPaymentSummary;
  customer: Customer;
  distributorCurrency: string;
}

// "How do they pay?": the terms they get against how long they take, how
// late and how often on time over the last 90 days, each raised invoice on
// one chart, and the overdue balance over time.
export function PaymentSection({ summary, customer, distributorCurrency }: Props) {
  const { last90Days, invoiceTimeline } = summary;
  const { onTime, judged } = paidByDueDate(invoiceTimeline);
  const days = (n: number | null, unit: string) => (n === null ? '—' : `${Math.round(n)}${unit}`);

  const tiles: MetricTileConfig[] = [
    {
      label: 'Terms vs reality',
      value: (
        <span className="flex items-baseline gap-2">
          <span className="text-muted">{days(last90Days.averageDaysAllowed, 'd')}</span>
          <svg aria-hidden="true" width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="2" className="self-center text-muted">
            <path d="M1 6h15M11 1l5 5-5 5" />
          </svg>
          <span>{last90Days.averageDaysToPay === null ? '—' : plural(Math.round(last90Days.averageDaysToPay), 'day')}</span>
        </span>
      ),
      captions: [
        'Invoice date to due, then to paid in full',
        ...(customer.paymentTerm ? [`Terms: ${customer.paymentTerm.name}`] : []),
      ],
    },
    {
      label: 'Average days late',
      value: last90Days.averageDaysLate === null ? '—' : plural(Math.round(last90Days.averageDaysLate), 'day'),
      tone: (last90Days.averageDaysLate ?? 0) > 0 ? 'bad' : 'default',
      captions: [`Trend: ${paymentTrendText(last90Days.trend)}`],
    },
    {
      label: 'Paid on time',
      value: judged === 0 ? '—' : `${onTime} of ${judged}`,
      tone: judged > 0 && onTime < judged / 2 ? 'bad' : 'default',
      captions: [
        judged === 0
          ? 'Nothing paid with a due date'
          : onTime === 0
            ? 'Every invoice paid after its due date'
            : onTime === judged
              ? 'Every invoice paid by its due date'
              : `${Math.round((onTime / judged) * 100)}% paid by the due date`,
      ],
    },
  ];

  return (
    <AccountSection
      id="payment-heading"
      title="How do they pay?"
      subtitle={last90Days.paidCount === 0 ? 'No invoices paid in the last 90 days' : `${plural(last90Days.paidCount, 'invoice')} paid in the last 90 days`}
    >
      <MetricTiles tiles={tiles} minWidth={220} />
      {invoiceTimeline.length > 0 && <InvoiceTimeline entries={invoiceTimeline} today={summary.asOf} />}
      <OverdueBalances overdue={summary.overdue} history={summary.overdueHistory} distributorCurrency={distributorCurrency} />
    </AccountSection>
  );
}
