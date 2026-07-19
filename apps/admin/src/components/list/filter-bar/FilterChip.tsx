import type { ActiveFilter, FilterFieldConfig } from './types';

interface FilterChipProps {
  filter: ActiveFilter;
  config: FilterFieldConfig;
  onEdit: () => void;
  onRemove: () => void;
}

function formatDisplayValue(filter: ActiveFilter, config: FilterFieldConfig): string {
  if (config.valueKind === 'multi-select') {
    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    return values.map((v) => config.options?.find((o) => o.value === v)?.label ?? v).join(', ');
  }
  const raw = filter.value as string;
  const fmt = config.formatValue ?? ((s: string) => s);
  if (config.valueKind === 'date-range' || filter.operator === 'between') {
    const [from, to] = raw.split(',');
    return `${fmt(from)} – ${fmt(to)}`;
  }
  return fmt(raw);
}

export function FilterChip({ filter, config, onEdit, onRemove }: FilterChipProps) {
  const operatorLabel = config.operators.find((o) => o.value === filter.operator)?.label ?? filter.operator;

  return (
    <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary/5 text-xs">
      <button
        type="button"
        onClick={onEdit}
        className="flex items-center gap-1 px-2 py-1 hover:bg-primary/10 transition-colors rounded-l-md"
      >
        <span className="text-muted">{config.label}</span>
        <span className="text-muted italic">{operatorLabel}</span>
        <span className="font-medium text-text">{formatDisplayValue(filter, config)}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="px-1.5 py-1 text-muted hover:text-red-500 transition-colors rounded-r-md"
        aria-label="Remove filter"
      >
        ×
      </button>
    </span>
  );
}
