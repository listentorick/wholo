export interface SegmentedFilterOption<T extends string> {
  value: T;
  label: string;
  /** Shown after the label, e.g. "Overdue 5" — omit for a plain option like "All". */
  count?: number;
}

interface SegmentedFilterProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: SegmentedFilterOption<T>[];
  onChange: (value: T) => void;
}

// A single-select toggle group, not FilterBar's multi-select/operator
// machinery (built for the flat entity tables it's used on elsewhere) — a
// handful of mutually exclusive states don't justify it.
//
// Below `sm`, a segmented pill group of more than two or three options is
// wide enough (alongside whatever else shares its row) to push itself
// off-screen, so it's replaced there by a native <select> showing just the
// active filter — one compact control instead of several permanently-
// expanded buttons. Both variants are mounted at once and CSS decides which
// shows; tests scope queries by data-testid.
export function SegmentedFilter<T extends string>({ ariaLabel, value, options, onChange }: SegmentedFilterProps<T>) {
  return (
    <>
      <select
        data-testid="filter-select"
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-text sm:hidden"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.count != null ? `${option.label} (${option.count})` : option.label}
          </option>
        ))}
      </select>
      <div
        data-testid="filter-pills"
        className="hidden flex-wrap rounded-md border border-border p-0.5 sm:inline-flex"
        role="group"
        aria-label={ariaLabel}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              value === option.value ? 'bg-primary/10 text-primary' : 'text-muted hover:text-text'
            }`}
          >
            {option.label}
            {option.count != null && <span className="opacity-80"> {option.count}</span>}
          </button>
        ))}
      </div>
    </>
  );
}
