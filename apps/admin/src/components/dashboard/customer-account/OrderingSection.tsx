import type { CustomerOrderingBehaviour } from '@wholo/types';
import { AccountSection, MetricTiles, type MetricTileConfig } from './AccountSection';
import { formatMoneyAmounts, orderingTrendText, plural, shortDate } from './customer-account';

interface Props {
  behaviour: CustomerOrderingBehaviour;
  distributorCurrency: string;
}

// "How do they buy?": recency, frequency, spend and product breadth, each with its reporting period.
export function OrderingSection({ behaviour, distributorCurrency }: Props) {
  const period = `Last ${behaviour.periodDays} days`;
  const sinceLast = behaviour.recency.daysSinceLastOrder;
  const tiles: MetricTileConfig[] = [
    {
      label: 'Last order',
      value: sinceLast === null ? 'No orders yet' : sinceLast === 0 ? 'Today' : `${plural(sinceLast, 'day')} ago`,
      captions: [behaviour.recency.lastOrderDate ? shortDate(behaviour.recency.lastOrderDate) : 'Since last order'],
    },
    { label: 'Orders', value: plural(behaviour.frequency.orders, 'order'), captions: [period] },
    {
      label: 'Spend (ex VAT)',
      value: formatMoneyAmounts(behaviour.monetary.amounts, distributorCurrency),
      captions: [`${period} · ${orderingTrendText(behaviour.trend, behaviour.periodDays)}`],
    },
    { label: 'Products bought', value: plural(behaviour.productBreadth.distinctProducts, 'product'), captions: [`Distinct products, ${period.toLowerCase()}`] },
  ];

  return (
    <AccountSection id="ordering-heading" title="How do they buy?" subtitle={`${shortDate(behaviour.periodStart)} – ${shortDate(behaviour.periodEnd)}`}>
      <MetricTiles tiles={tiles} minWidth={170} />
    </AccountSection>
  );
}
