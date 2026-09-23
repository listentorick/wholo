import type { ReactNode } from 'react';

export interface DetailTabItem<TKey extends string = string> {
  key: TKey;
  label: string;
  /** Optional number shown after the label (e.g. a status filter's row count). */
  count?: number;
}

interface DetailTabsProps<TKey extends string = string> {
  tabs: DetailTabItem<TKey>[];
  activeKey: TKey;
  onChange: (key: TKey) => void;
  /** Controls that belong to the active tab, shown on the same bar: beside the tabs from lg up, above them below. */
  actions?: ReactNode;
}

export function DetailTabs<TKey extends string = string>({ tabs, activeKey, onChange, actions }: DetailTabsProps<TKey>) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border">
      <nav className="order-2 -mb-px flex min-w-0 gap-6 overflow-x-auto lg:order-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={[
              'shrink-0 border-b-2 pb-3 text-sm font-medium transition-colors',
              activeKey === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-text hover:border-border',
            ].join(' ')}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`ml-1.5 text-xs font-medium ${activeKey === tab.key ? 'text-primary/80' : 'text-muted'}`}>{tab.count}</span>
            )}
          </button>
        ))}
      </nav>
      {actions && <div className="order-1 flex w-full justify-end pb-2 lg:order-2 lg:w-auto">{actions}</div>}
    </div>
  );
}
