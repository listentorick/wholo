export type BoardAttentionFilter = 'all' | 'unassigned';

interface DeliveryBoardFiltersProps {
  filter: BoardAttentionFilter;
  onChange: (filter: BoardAttentionFilter) => void;
}

const OPTIONS: { value: BoardAttentionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unassigned', label: 'Unassigned only' },
];

// Only Unassigned is filterable in M3 — Missed doesn't exist until M5, and
// a single boolean doesn't justify FilterBar's multi-select/operator
// machinery (built for the flat entity tables it's used on elsewhere).
// Only affects the List view; Board stays fully visible unconditionally
// (decision #2 in the delivery-planning-pbi-plan decisions log).
export function DeliveryBoardFilters({ filter, onChange }: DeliveryBoardFiltersProps) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Filter deliveries">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={filter === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            filter === option.value ? 'bg-primary/10 text-primary' : 'text-muted hover:text-text'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
