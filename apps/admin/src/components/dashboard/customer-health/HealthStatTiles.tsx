'use client';

import type { CustomerHealthResponse } from '@wholo/types';
import { StatTileFrame } from '../StatTile';

interface Props {
  tiles: CustomerHealthResponse['tiles'];
  riskOnly: boolean;
  onToggleRisk: () => void;
  currency: (value: number) => string;
}

// "Customers at risk" doubles as a filter, like the Delivery dashboard's
// attention tiles: clicking it narrows the needing-attention table below
// rather than linking away. The overdue tile is invoice money past its due
// date, synced back from the accounting system (ADR-072).
export function HealthStatTiles({ tiles, riskOnly, onToggleRisk, currency }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" role="group" aria-label="Customer health summary">
      <StatTileFrame
        label="Active customers"
        value={tiles.activeCustomers90d}
        footer={<span className="text-xs font-medium text-muted">Last 90 days</span>}
      />

      <StatTileFrame
        label="Customers at risk"
        value={tiles.atRiskCount}
        selected={riskOnly}
        onClick={onToggleRisk}
        footer={
          <span className="text-xs font-medium text-muted">
            {riskOnly ? 'Filter on' : 'Tap to filter'}
          </span>
        }
      />

      <StatTileFrame
        label="Sales, last 30 days"
        value={currency(tiles.salesLast30d)}
        footer={<span className="text-xs font-medium text-muted">Qualifying orders</span>}
      />

      <StatTileFrame
        label="Overdue invoices"
        value={currency(tiles.overdueBalance)}
        footer={
          <span className="text-xs font-medium text-muted">
            {tiles.overdueInvoiceCount === 0
              ? 'Nothing overdue'
              : `${tiles.overdueInvoiceCount} invoice${tiles.overdueInvoiceCount === 1 ? '' : 's'} past due`}
          </span>
        }
      />
    </div>
  );
}
