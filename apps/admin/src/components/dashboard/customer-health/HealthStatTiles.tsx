'use client';

import type { CustomerHealthResponse } from '@wholo/types';
import { StatTileFrame } from '../StatTile';

interface Props {
  tiles: CustomerHealthResponse['tiles'];
  riskOnly: boolean;
  onToggleRisk: () => void;
  currency: (value: number) => string;
}

// Three tiles for v1 — no overdue-balance tile: payment/invoice signals are
// out of scope until Xero-synced data is reachable per customer. "Customers
// at risk" doubles as a filter, like the Delivery dashboard's attention
// tiles: clicking it narrows the needing-attention table below rather than
// linking away.
export function HealthStatTiles({ tiles, riskOnly, onToggleRisk, currency }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3" role="group" aria-label="Customer health summary">
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
    </div>
  );
}
