import { useEffect, useRef, useState } from 'react';
import { FilterChip } from './FilterChip';
import { FilterPopover } from './FilterPopover';
import type { ActiveFilter, FilterFieldConfig } from './types';

function uid() {
  return Math.random().toString(36).slice(2);
}

interface FilterBarProps {
  fields: FilterFieldConfig[];
  filters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
  // Slot for a caller-owned chip unrelated to filtering (e.g. Orders' sort
  // chip) — FilterBar itself has no concept of sorting.
  extraChip?: React.ReactNode;
  onClearAll: () => void;
}

export function FilterBar({ fields, filters, onFiltersChange, extraChip, onClearAll }: FilterBarProps) {
  const [popoverTarget, setPopoverTarget] = useState<'add' | string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverTarget(null);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const editingFilter = popoverTarget && popoverTarget !== 'add'
    ? filters.find((f) => f.id === popoverTarget)
    : undefined;

  function handleAdd(f: Omit<ActiveFilter, 'id'>) {
    onFiltersChange([...filters, { ...f, id: uid() }]);
    setPopoverTarget(null);
  }

  function handleEdit(id: string, f: Omit<ActiveFilter, 'id'>) {
    onFiltersChange(filters.map((x) => (x.id === id ? { ...f, id } : x)));
    setPopoverTarget(null);
  }

  function handleRemove(id: string) {
    onFiltersChange(filters.filter((f) => f.id !== id));
    if (popoverTarget === id) setPopoverTarget(null);
  }

  const showClearAll = filters.length > 0 || !!extraChip;

  return (
    <div ref={containerRef} className="relative mb-4">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => {
          const config = fields.find((fc) => fc.field === f.field);
          if (!config) return null;
          return (
            <FilterChip
              key={f.id}
              filter={f}
              config={config}
              onEdit={() => setPopoverTarget((p) => (p === f.id ? null : f.id))}
              onRemove={() => handleRemove(f.id)}
            />
          );
        })}

        {extraChip}

        <button
          type="button"
          onClick={() => setPopoverTarget((p) => (p === 'add' ? null : 'add'))}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1 text-xs text-muted hover:border-primary hover:text-primary transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3 w-3">
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
          Add filter
        </button>

        {showClearAll && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-muted hover:text-red-500 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {popoverTarget !== null && (
        <FilterPopover
          fields={fields}
          initial={editingFilter}
          onApply={(f) => (editingFilter ? handleEdit(editingFilter.id, f) : handleAdd(f))}
          onCancel={() => setPopoverTarget(null)}
        />
      )}
    </div>
  );
}
