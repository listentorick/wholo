import { useState } from 'react';
import type { ActiveFilter, FilterFieldConfig, FilterValueKind } from './types';

interface FilterPopoverProps {
  fields: FilterFieldConfig[];
  initial?: ActiveFilter;
  onApply: (filter: Omit<ActiveFilter, 'id'>) => void;
  onCancel: () => void;
}

// A 'between' operator on a date field needs two date inputs, regardless of
// the field's normal single-value kind — the only case where operator, not
// just field, changes the value widget shape.
function effectiveValueKind(fieldConfig: FilterFieldConfig, operator: string): FilterValueKind {
  if (fieldConfig.valueKind === 'date' && operator === 'between') return 'date-range';
  return fieldConfig.valueKind;
}

export function FilterPopover({ fields, initial, onApply, onCancel }: FilterPopoverProps) {
  const startingField = fields.find((f) => f.field === initial?.field) ?? fields[0];
  const [fieldKey, setFieldKey] = useState<string>(startingField.field);
  const fieldConfig = fields.find((f) => f.field === fieldKey) ?? fields[0];

  const [operator, setOperator] = useState<string>(initial?.operator ?? fieldConfig.operators[0].value);
  const [value, setValue] = useState<string>(
    Array.isArray(initial?.value) ? (initial.value[0] ?? '') : (initial?.value as string | undefined) ?? '',
  );
  const [multiSelections, setMultiSelections] = useState<string[]>(
    Array.isArray(initial?.value) ? initial.value : initial?.value ? [initial.value as string] : [],
  );
  const [rangeFrom, setRangeFrom] = useState(
    initial?.operator === 'between' ? (initial.value as string).split(',')[0] ?? '' : '',
  );
  const [rangeTo, setRangeTo] = useState(
    initial?.operator === 'between' ? (initial.value as string).split(',')[1] ?? '' : '',
  );

  const valueKind = effectiveValueKind(fieldConfig, operator);

  function handleFieldChange(key: string) {
    const next = fields.find((f) => f.field === key) ?? fields[0];
    setFieldKey(key);
    setOperator(next.operators[0].value);
    setValue('');
    setMultiSelections([]);
    setRangeFrom('');
    setRangeTo('');
  }

  function handleOperatorChange(op: string) {
    setOperator(op);
    setValue('');
    setRangeFrom('');
    setRangeTo('');
  }

  function toggleMultiSelect(val: string) {
    setMultiSelections((prev) => (prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]));
  }

  function handleApply() {
    let finalValue: string | string[] = value;
    if (valueKind === 'multi-select') finalValue = multiSelections;
    if (valueKind === 'date-range') finalValue = `${rangeFrom},${rangeTo}`;
    onApply({ field: fieldKey, operator, value: finalValue });
  }

  function canApply(): boolean {
    if (valueKind === 'multi-select') return multiSelections.length > 0;
    if (valueKind === 'date-range') return !!rangeFrom && !!rangeTo;
    return !!value.trim();
  }

  return (
    <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-border bg-white shadow-lg border-l-[3px] border-l-primary">
      <div className="p-4 space-y-3">
        <div>
          <label htmlFor="filter-field" className="mb-1 block text-xs font-medium text-muted">Field</label>
          <select
            id="filter-field"
            value={fieldKey}
            onChange={(e) => handleFieldChange(e.target.value)}
            className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {fields.map((f) => (
              <option key={f.field} value={f.field}>{f.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-operator" className="mb-1 block text-xs font-medium text-muted">Operator</label>
          <select
            id="filter-operator"
            value={operator}
            onChange={(e) => handleOperatorChange(e.target.value)}
            className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {fieldConfig.operators.map((op) => (
              <option key={op.value} value={op.value}>{op.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Value</label>

          {valueKind === 'multi-select' ? (
            <div className="space-y-1.5 rounded-md border border-border p-2.5">
              {fieldConfig.options?.map((opt) => (
                <label key={opt.value} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={multiSelections.includes(opt.value)}
                    onChange={() => toggleMultiSelect(opt.value)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  <span className="text-sm text-text">{opt.label}</span>
                </label>
              ))}
            </div>
          ) : valueKind === 'date-range' ? (
            <div className="space-y-1.5">
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                placeholder="From"
                className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <input
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                placeholder="To"
                className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          ) : valueKind === 'date' ? (
            <input
              type="date"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Type to filter…"
              className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              onKeyDown={(e) => { if (e.key === 'Enter' && canApply()) handleApply(); }}
              autoFocus
            />
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Apply →
          </button>
        </div>
      </div>
    </div>
  );
}
