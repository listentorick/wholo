import type { EChartsCoreOption } from 'echarts/core';
import type { CustomerHealthTopCustomer } from '@wholo/types';
import { TEXT_COLOR, axisLabelStyle, axisLineStyle, chartTooltip, splitLineStyle } from '../chart-theme';
import { TIER_META, escapeHtml, formatShare } from './customer-health';
import { TIER_COLOURS } from './healthTierChartOption';

// Every bar is the same brand blue: colour must not carry a customer's health.
// The tier rides along as a coloured dot in the axis label *and* as words in
// the tooltip and the "View as table" fallback, so it never relies on colour alone.
export const SALES_BAR_COLOUR = '#1565FF';

const MAX_NAME_LENGTH = 18;
const truncate = (name: string) => (name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH - 1)}…` : name);

/** The hover card for one customer: who, how much, what share, and how they are doing. */
export function salesTooltip(customer: CustomerHealthTopCustomer, currency: (value: number) => string): string {
  return (
    `<div style="min-width:170px"><div style="font-weight:600;margin-bottom:6px">${escapeHtml(customer.customerName)}</div>` +
    `<div style="display:flex;justify-content:space-between;gap:16px"><span>Sales</span><b>${currency(customer.value)}</b></div>` +
    `<div style="display:flex;justify-content:space-between;gap:16px"><span>Share</span><b>${formatShare(customer.share)}</b></div>` +
    `<div style="display:flex;justify-content:space-between;gap:16px"><span>Health</span><b>${TIER_META[customer.tier].label}</b></div></div>`
  );
}

/** Horizontal bars, biggest on top. */
export function buildSalesConcentrationOption(customers: CustomerHealthTopCustomer[], currency: (value: number) => string): EChartsCoreOption {
  return {
    grid: { top: 4, right: 64, bottom: 4, left: 0, containLabel: true },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      inverse: true,
      data: customers.map((c) => c.customerName),
      axisLine: axisLineStyle,
      axisTick: { show: false },
      splitLine: splitLineStyle,
      axisLabel: {
        ...axisLabelStyle,
        fontSize: 12,
        color: TEXT_COLOR,
        formatter: (_name: string, index: number) => {
          const customer = customers[index];
          return customer ? `{${customer.tier}|●} ${truncate(customer.customerName)}` : '';
        },
        rich: {
          healthy: { color: TIER_COLOURS.healthy, fontSize: 10 },
          watch: { color: TIER_COLOURS.watch, fontSize: 10 },
          at_risk: { color: TIER_COLOURS.at_risk, fontSize: 10 },
        },
      },
    },
    tooltip: {
      ...chartTooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const first = (Array.isArray(params) ? params[0] : params) as { dataIndex: number } | undefined;
        const customer = first ? customers[first.dataIndex] : undefined;
        return customer ? salesTooltip(customer, currency) : '';
      },
    },
    series: [
      {
        name: 'Sales',
        type: 'bar',
        barMaxWidth: 16,
        data: customers.map((c) => c.value),
        itemStyle: { color: SALES_BAR_COLOUR, borderRadius: [0, 3, 3, 0] },
        label: { show: true, position: 'right', color: TEXT_COLOR, fontSize: 11, fontWeight: 600, formatter: (p: { value: number }) => currency(p.value) },
      },
    ],
  };
}
