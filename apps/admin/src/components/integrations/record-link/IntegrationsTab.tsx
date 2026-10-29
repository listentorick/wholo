'use client';

import type { ReactNode } from 'react';

// A record's Integrations tab: one card per type of integration. A
// distributor has at most one connection per type; only Accounting exists
// today, so callers pass its AccountingLinkSection.
export function IntegrationsTab({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5">{children}</div>;
}
