import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { FlaggedCustomer } from '@wholo/types';
import { NeedingAttentionTable } from './NeedingAttentionTable';

const currency = (v: number) => `£${v}`;

const customers: FlaggedCustomer[] = [
  {
    customerId: 'rel-1',
    customerName: 'Riverside Care Home',
    tier: 'at_risk',
    reasons: [
      { code: 'MISSED_ORDER', category: 'customer_behaviour', severity: 'at_risk', text: 'No order in 32 days (usual gap ~10 days)' },
      { code: 'OUR_MISTAKES', category: 'our_fault', severity: 'watch', text: '1 order rejected or cancelled in the last 90 days' },
    ],
    spend30d: 4820,
    lastOrderDate: '2026-09-12',
  },
  {
    customerId: 'rel-2',
    customerName: 'The Green Grocer',
    tier: 'watch',
    reasons: [{ code: 'LATE_DELIVERY', category: 'customer_behaviour', severity: 'watch', text: '2 of last 8 deliveries late or failed' }],
    spend30d: 3140,
    lastOrderDate: null,
  },
];

describe('NeedingAttentionTable', () => {
  it('lists each flagged customer with a link to their page, why they were flagged, and their tier', () => {
    render(<NeedingAttentionTable customers={customers} riskOnly={false} currency={currency} />);

    expect(screen.getAllByRole('link', { name: 'Riverside Care Home' })[0]).toHaveAttribute('href', '/customers/rel-1');
    expect(screen.getAllByText(/No order in 32 days/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('At risk').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Watch').length).toBeGreaterThan(0);
  });

  it('marks a reason we caused with "Us:", so it never reads as the customer\'s doing', () => {
    render(<NeedingAttentionTable customers={customers} riskOnly={false} currency={currency} />);
    expect(screen.getAllByText(/Us: 1 order rejected or cancelled/).length).toBeGreaterThan(0);
  });

  it('shows "Never" for a customer with no last order', () => {
    render(<NeedingAttentionTable customers={customers} riskOnly={false} currency={currency} />);
    expect(screen.getAllByText('Never').length).toBeGreaterThan(0);
  });

  it('narrows to at-risk customers only when the filter is on', () => {
    render(<NeedingAttentionTable customers={customers} riskOnly={true} currency={currency} />);

    expect(screen.getAllByText('Riverside Care Home').length).toBeGreaterThan(0);
    expect(screen.queryByText('The Green Grocer')).not.toBeInTheDocument();
    expect(screen.getByText('Showing only customers currently at risk.')).toBeInTheDocument();
  });

  it('says so when nothing needs attention', () => {
    render(<NeedingAttentionTable customers={[]} riskOnly={false} currency={currency} />);
    expect(screen.getByText('Nothing needs attention right now.')).toBeInTheDocument();
  });

  it('says so when the at-risk filter matches nobody', () => {
    render(<NeedingAttentionTable customers={[customers[1]]} riskOnly={true} currency={currency} />);
    expect(screen.getByText('No customers are currently at risk.')).toBeInTheDocument();
  });
});
