'use client';

import { Suspense } from 'react';
import { Permission } from '@wholo/types';
import { useAuth } from '@/lib/auth-context';
import { useCan } from '@/lib/permissions';
import { useQueryParamTab } from '@/lib/hooks/use-query-param-tab';
import type { DetailTabItem } from '@/components/detail/DetailTabs';
import type { DashboardNav, DashboardTab } from '@/components/dashboard/DashboardBar';
import { SalesDashboard } from '@/components/dashboard/SalesDashboard';
import { DeliveryDashboard } from '@/components/dashboard/delivery/DeliveryDashboard';

// The home page shows whichever dashboards this person can use. Delivery (where
// are we at right now) needs orders + deliveries — Warehouse staff, Operations
// manager, Owner. Sales (the commercial dashboard) needs analytics:read — Owner
// and Operations manager. Someone with both gets two tabs, opening on Delivery; with
// one, just that dashboard and no tab strip; with neither, a plain message. There is
// deliberately no greeting: the top bar already says who and where you are.
// The API enforces the same permissions on every request; this only keeps a
// person from meeting a screen that would fail for them.
function DashboardHome() {
  const { user } = useAuth();
  const can = useCan();
  const { activeTab, setTab } = useQueryParamTab<DashboardTab>('delivery');

  if (!user) return null;

  const tabs: DetailTabItem<DashboardTab>[] = [];
  if (can(Permission.ORDERS_READ) && can(Permission.DELIVERY_READ)) tabs.push({ key: 'delivery', label: 'Delivery' });
  if (can(Permission.ANALYTICS_READ)) tabs.push({ key: 'sales', label: 'Sales' });

  // A stale or hand-edited ?tab= falls back to the first dashboard they can use.
  const current = tabs.find((t) => t.key === activeTab)?.key ?? tabs[0]?.key;

  // Each dashboard draws the tab strip itself, with its own controls on the same row.
  const nav: DashboardNav | undefined = tabs.length > 1 && current ? { tabs, activeKey: current, onChange: setTab } : undefined;

  return (
    <div>
      {current === 'delivery' && <DeliveryDashboard nav={nav} />}
      {current === 'sales' && <SalesDashboard nav={nav} />}
      {!current && (
        <p className="rounded-lg border border-border bg-white px-5 py-10 text-center text-sm text-muted">
          There is nothing to show here for your role yet.
        </p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  // useSearchParams (behind the tab hook) needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <DashboardHome />
    </Suspense>
  );
}
