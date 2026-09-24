'use client';

import type { ReactNode } from 'react';
import { DetailTabs, type DetailTabItem } from '@/components/detail/DetailTabs';

export type DashboardTab = 'delivery' | 'customers' | 'sales';

/** The dashboards a person can switch between; passed down by the page shell when there is more than one. */
export interface DashboardNav {
  tabs: DetailTabItem<DashboardTab>[];
  activeKey: DashboardTab;
  onChange: (key: DashboardTab) => void;
}

interface Props {
  nav?: DashboardNav;
  /** The controls that belong to this dashboard (refresh, period…). */
  actions?: ReactNode;
}

// The one bar at the top of a dashboard: the tab strip with this dashboard's own
// controls on the same row. Each dashboard draws it, so the tabs stay put while
// it loads or has failed. With a single dashboard there are no tabs, so it is just
// the controls, right-aligned.
export function DashboardBar({ nav, actions }: Props) {
  if (nav) return <DetailTabs tabs={nav.tabs} activeKey={nav.activeKey} onChange={nav.onChange} actions={actions} />;
  if (!actions) return null;
  return <div className="mb-4 flex justify-end">{actions}</div>;
}
