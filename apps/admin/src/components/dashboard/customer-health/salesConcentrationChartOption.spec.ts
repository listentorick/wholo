import { describe, it, expect } from 'vitest';
import { SALES_BAR_COLOUR, buildSalesConcentrationOption, salesTooltip } from './salesConcentrationChartOption';
import { TIER_COLOURS } from './healthTierChartOption';
import type { CustomerHealthTopCustomer } from '@wholo/types';

const currency = (v: number) => `£${v}`;
const customers: CustomerHealthTopCustomer[] = [
  { customerId: 'r1', customerName: 'Marlowe Hotel', tier: 'healthy', value: 24680, share: 0.082 },
  { customerId: 'r2', customerName: 'Riverside Care Home With A Very Long Name', tier: 'at_risk', value: 18450, share: 0.061 },
];

type Option = {
  yAxis: { inverse: boolean; data: string[]; axisLabel: { formatter: (name: string, index: number) => string } };
  series: Array<{ type: string; data: number[]; itemStyle: { color: string }; label: { formatter: (p: { value: number }) => string } }>;
};
const build = () => buildSalesConcentrationOption(customers, currency) as unknown as Option;

describe('buildSalesConcentrationOption', () => {
  it('plots one horizontal bar per customer, biggest on top', () => {
    const option = build();
    expect(option.series[0].type).toBe('bar');
    expect(option.series[0].data).toEqual([24680, 18450]);
    expect(option.yAxis.data).toEqual(customers.map((c) => c.customerName));
    expect(option.yAxis.inverse).toBe(true);
  });

  it('draws every bar in one colour, so colour never carries a customer\'s health', () => {
    expect(build().series[0].itemStyle.color).toBe(SALES_BAR_COLOUR);
  });

  it('marks health with a coloured dot beside the name, truncating a long name', () => {
    const { formatter } = build().yAxis.axisLabel;
    expect(formatter('', 0)).toBe(`{${'healthy'}|●} Marlowe Hotel`);
    expect(formatter('', 1)).toMatch(/^\{at_risk\|●\} Riverside Care Ho…$/);
    expect(TIER_COLOURS.at_risk).toBeTruthy();
  });

  it('labels each bar with its value in the given currency', () => {
    expect(build().series[0].label.formatter({ value: 24680 })).toBe('£24680');
  });
});

describe('salesTooltip', () => {
  it('says the health in words, not just colour', () => {
    const html = salesTooltip(customers[1], currency);
    expect(html).toContain('At risk');
    expect(html).toContain('£18450');
    expect(html).toContain('6.1%');
  });

  it('escapes a customer name that contains markup — names are typed by other tenants and this is rendered as HTML', () => {
    const html = salesTooltip({ ...customers[0], customerName: '<img src=x onerror=alert(1)>' }, currency);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
