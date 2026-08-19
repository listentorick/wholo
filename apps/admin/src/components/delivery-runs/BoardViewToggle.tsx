export type BoardViewMode = 'board' | 'list';

interface BoardViewToggleProps {
  mode: BoardViewMode;
  onChange: (mode: BoardViewMode) => void;
}

const OPTIONS: { value: BoardViewMode; label: string }[] = [
  { value: 'board', label: 'Board' },
  { value: 'list', label: 'List' },
];

export function BoardViewToggle({ mode, onChange }: BoardViewToggleProps) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Board view">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={mode === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === option.value ? 'bg-primary/10 text-primary' : 'text-muted hover:text-text'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
