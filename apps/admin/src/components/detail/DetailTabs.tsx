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
}

export function DetailTabs<TKey extends string = string>({ tabs, activeKey, onChange }: DetailTabsProps<TKey>) {
  return (
    <div className="mb-6 border-b border-border">
      <nav className="-mb-px flex gap-6 overflow-x-auto">
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
    </div>
  );
}
