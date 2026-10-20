'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CustomerPaymentSummary } from '@wholo/types';
import { useEChart } from '@/lib/hooks/use-echart';
import { makeCurrencyFormatter } from '../currency';
import { ChartLegend } from '../ChartLegend';
import { buildExposureOption, exposureMax, exposureSegments } from './accountChartOptions';
import { AccountSection, MetricTiles, type MetricTileConfig } from './AccountSection';
import { dayMonth, exposure, exposureSummary, formatMoneyAmounts, inDaysText, nextPaymentDue, overdueStory, plural } from './customer-account';

echarts.use([BarChart, GridComponent, MarkLineComponent, CanvasRenderer]);

interface Props {
  summary: CustomerPaymentSummary;
  distributorCurrency: string;
}

function ExposureBar({ credit, notYetInvoiced }: Pick<CustomerPaymentSummary, 'credit' | 'notYetInvoiced'>) {
  const { containerRef, chartRef } = useEChart();
  const fmt = makeCurrencyFormatter(credit.used.currency);

  useEffect(() => {
    chartRef.current?.setOption(buildExposureOption(credit, notYetInvoiced), true);
  }, [credit, notYetInvoiced, chartRef]);

  const segments = exposureSegments(credit, notYetInvoiced);
  return (
    <div>
      <div ref={containerRef} role="img" aria-label={exposureSummary(credit, notYetInvoiced)} className="h-9 w-full" />
      <div className="mt-1 flex justify-between text-xs text-muted" aria-hidden="true">
        <span>{fmt(0)}</span>
        <span>{fmt(exposureMax(credit, notYetInvoiced))}</span>
      </div>
      {segments.length > 1 && (
        <div className="mt-2">
          <ChartLegend items={segments.map((s) => ({ label: s.label, color: s.colour, variant: 'box' }))} />
        </div>
      )}
    </div>
  );
}

// "How exposed are we?": what the customer owes and will owe against the
// credit limit, when the next payment falls due, and what is overdue. Orders
// are invoiced on acceptance, so one with no invoice points to a problem with
// the accounting integration, and is labelled as such.
export function ExposureSection({ summary, distributorCurrency }: Props) {
  const { credit, outstanding, overdue, notYetInvoiced, dueNext7Days } = summary;
  const fmt = makeCurrencyFormatter(credit.used.currency);
  const money = (amounts: CustomerPaymentSummary['outstanding']['amounts']) => formatMoneyAmounts(amounts, distributorCurrency);
  const next = nextPaymentDue(summary.openInvoices, summary.asOf);
  const notYetDue = outstanding.count - overdue.count;

  // The headline is the bar's total, so the two always agree; what makes it up follows.
  const e = exposure(credit, notYetInvoiced);
  const parts = e.notInvoiced > 0 ? `${fmt(e.owed)} owed + ${fmt(e.notInvoiced)} not invoiced` : 'owed';
  const standing =
    e.limit === null ? (
      `${parts} · no credit limit set`
    ) : e.over > 0 ? (
      <>
        {parts} · limit {fmt(e.limit)} · <strong className="font-semibold text-red-700">{fmt(e.over)} over</strong>
      </>
    ) : (
      `${parts} · limit ${fmt(e.limit)} · ${fmt(e.available ?? 0)} available${e.usedPercent === null ? '' : ` (${e.usedPercent}% used)`}`
    );

  const tiles: MetricTileConfig[] = [
    {
      label: 'Open invoices',
      value: `${outstanding.count} · ${money(outstanding.amounts)}`,
      captions: [
        outstanding.count === 0
          ? 'Nothing owed'
          : overdue.count > 0
            ? `${overdue.count} overdue · ${notYetDue} not yet due`
            : outstanding.count === 1
              ? 'Not due yet'
              : outstanding.count === 2
                ? 'Neither is due yet'
                : 'None due yet',
      ],
    },
    {
      label: 'Next payment due',
      value: next ? dayMonth(next.dueDate) : '—',
      captions: [
        next ? `${money(next.amounts)} · ${inDaysText(next.inDays)}` : 'Nothing falling due',
        `${money(dueNext7Days.amounts)} due in the next 7 days`,
      ],
    },
    {
      label: 'Orders not invoiced',
      value: summary.accountingSync.connected ? money(notYetInvoiced.amounts) : '—',
      tone: summary.accountingSync.connected && notYetInvoiced.count > 0 ? 'bad' : 'default',
      captions: !summary.accountingSync.connected
        ? ['Accounting not connected']
        : notYetInvoiced.count === 0
          ? ['Every accepted order is invoiced']
          : [
              `${plural(notYetInvoiced.count, 'accepted order')} with no invoice yet`,
              <Link key="check" href="/integrations/accounting" className="font-medium text-primary hover:underline">
                Check the accounting integration
              </Link>,
            ],
    },
    {
      label: 'Overdue now',
      value: money(overdue.amounts),
      tone: overdue.count > 0 ? 'bad' : 'default',
      captions: [
        overdue.count > 0
          ? `${plural(overdue.count, 'invoice')} · oldest ${plural(overdue.oldestDaysOverdue ?? 0, 'day')}`
          : (overdueStory(summary.overdueHistory) ?? 'Nothing overdue'),
      ],
    },
  ];

  return (
    <AccountSection id="exposure-heading" title="How exposed are we?" subtitle="Owed vs credit limit">
      <div className="flex flex-col gap-2">
        <p className="flex flex-wrap items-baseline gap-x-2.5 text-sm text-muted">
          <span className="text-3xl font-bold tracking-tight text-text">{fmt(e.total)}</span>
          <span>{standing}</span>
        </p>
        <ExposureBar credit={credit} notYetInvoiced={notYetInvoiced} />
      </div>
      <MetricTiles tiles={tiles} minWidth={170} />
    </AccountSection>
  );
}
