export type BoardAttentionFilter = 'all' | 'unassigned' | 'missed';

interface DeliveryBoardFiltersProps {
  filter: BoardAttentionFilter;
  onChange: (filter: BoardAttentionFilter) => void;
}

const OPTIONS: { value: BoardAttentionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unassigned', label: 'Unassigned only' },
  { value: 'missed', label: 'Missed only' },
];

// A single-select toggle group, not FilterBar's multi-select/operator
// machinery (built for the flat entity tables it's used on elsewhere) — three
// mutually exclusive states don't justify it. Only affects the List view;
// Board stays fully visible unconditionally (decision #2 in the
// delivery-planning-pbi-plan decisions log).
//
// Below `sm`, the segmented pill group is wide enough (with the date-range
// pill and page title alongside it) to push itself off-screen, so it's
// replaced there by a native <select> showing just the active filter — one
// compact control instead of three permanently-expanded buttons, keeping the
// whole header to a single row on a phone. Both variants are mounted at
// once and CSS decides which shows, same convention as page.tsx's own
// board-view/list-view split — tests scope queries by data-testid.
export function DeliveryBoardFilters({ filter, onChange }: DeliveryBoardFiltersProps) {
  return (
    <>
      <select
        data-testid="filter-select"
        aria-label="Filter deliveries"
        value={filter}
        onChange={(e) => onChange(e.target.value as BoardAttentionFilter)}
        className="rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-text sm:hidden"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <div
        data-testid="filter-pills"
        className="hidden rounded-md border border-border p-0.5 sm:inline-flex"
        role="group"
        aria-label="Filter deliveries"
      >
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
    </>
  );
}
