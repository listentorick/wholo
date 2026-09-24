'use client';

import Link from 'next/link';
import type { FlaggedCustomer } from '@wholo/types';
import { StatusBadge } from '@/components/list/StatusBadge';
import { ListTableShell } from '@/components/list/ListTableShell';
import { ListTh } from '@/components/list/ListTh';
import { MobileCardList } from '@/components/list/MobileCardList';
import { MobileCardField } from '@/components/list/MobileCardField';
import { TIER_META, reasonText, shortDate } from './customer-health';

interface Props {
  customers: FlaggedCustomer[];
  riskOnly: boolean;
  currency: (value: number) => string;
}

const lastOrder = (c: FlaggedCustomer) => (c.lastOrderDate ? shortDate(c.lastOrderDate) : 'Never');
const reasons = (c: FlaggedCustomer) => c.reasons.map(reasonText).join(' · ');

// The one list someone acts on: customers whose ordering, spend, delivery
// experience or relationship history has moved. Most urgent (at-risk) first —
// see rollUpTier in customer-health.logic.ts. Each row opens the customer,
// where the account rep would follow up.
export function NeedingAttentionTable({ customers, riskOnly, currency }: Props) {
  const rows = riskOnly ? customers.filter((c) => c.tier === 'at_risk') : customers;

  return (
    <section className="rounded-lg border border-border bg-white p-5" aria-labelledby="attention-heading">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="attention-heading" className="text-sm font-semibold text-text">Customers needing attention</h2>
          <p className="mt-0.5 text-xs text-muted">
            {riskOnly
              ? 'Showing only customers currently at risk.'
              : 'Reduced activity, delivery issues or a relationship that has never ordered. Most urgent first.'}
          </p>
        </div>
        <Link href="/customers" className="text-xs font-medium text-primary hover:underline">All customers &rsaquo;</Link>
      </div>

      {rows.length === 0 ? (
        <p className="px-1 py-10 text-center text-sm text-muted">
          {riskOnly ? 'No customers are currently at risk.' : 'Nothing needs attention right now.'}
        </p>
      ) : (
        <ListTableShell>
          <MobileCardList
            items={rows}
            getId={(c) => c.customerId}
            getLabel={(c) => c.customerName}
            entityLabelPlural="customers"
            renderPrimary={(c) => c.customerName}
            renderSecondary={(c) => currency(c.spend30d)}
            renderStatus={(c) => <StatusBadge label={TIER_META[c.tier].label} tone={TIER_META[c.tier].tone} />}
            renderExpanded={(c) => (
              <>
                <MobileCardField label="Why flagged" value={reasons(c)} tone="muted" />
                <MobileCardField label="Last order" value={lastOrder(c)} tone="muted" />
                <Link href={`/customers/${c.customerId}`} className="text-xs font-medium text-primary hover:underline">Open customer</Link>
              </>
            )}
          />

          <div className="hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border">
                <tr>
                  <ListTh>Customer</ListTh>
                  <ListTh>Why flagged</ListTh>
                  <ListTh className="text-right">30-day spend</ListTh>
                  <ListTh>Last order</ListTh>
                  <ListTh><span className="sr-only">Open</span></ListTh>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.customerId} className="border-b border-border last:border-0 hover:bg-canvas">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <StatusBadge label={TIER_META[c.tier].label} tone={TIER_META[c.tier].tone} />
                        <Link href={`/customers/${c.customerId}`} className="font-medium text-primary hover:underline">{c.customerName}</Link>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">{reasons(c)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text">{currency(c.spend30d)}</td>
                    <td className="px-4 py-2.5 text-muted">{lastOrder(c)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/customers/${c.customerId}`} className="whitespace-nowrap text-xs font-medium text-primary hover:underline">Open &rsaquo;</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ListTableShell>
      )}
    </section>
  );
}
