'use client';

import { useState } from 'react';
import { TextInput } from '@/components/form/TextInput';

interface Props {
  driverName: string | null;
  // True when the containing run is READY — driver is locked exactly like
  // membership/sequence until an explicit Reopen.
  locked: boolean;
  saving: boolean;
  onSave: (driverName: string | null) => void;
}

// Inline click-to-edit, not a full form — this is a quick override of a
// single field on an already-visible run, not a multi-field entity edit
// (contrast DeliveryRouteForm's defaultDriverName, a real form field).
// Labelled distinctly from the route's default per the M4 PBI decision.
export function RunDriverField({
  driverName, locked, saving, onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(driverName ?? '');

  if (locked || !editing) {
    return (
      <button
        type="button"
        disabled={locked}
        onClick={() => {
          setValue(driverName ?? '');
          setEditing(true);
        }}
        className="truncate text-left text-xs text-muted hover:text-text disabled:cursor-not-allowed disabled:hover:text-muted"
        title="Driver for this run — overrides the route default"
      >
        {driverName ?? 'No driver assigned'}
      </button>
    );
  }

  function commit() {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed === (driverName ?? '')) return;
    onSave(trimmed || null);
  }

  return (
    <div className="flex items-center gap-1">
      <TextInput
        autoFocus
        aria-label="Driver for this run — overrides the route default"
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="!py-1 text-xs"
      />
      <button
        type="button"
        onClick={commit}
        disabled={saving}
        aria-label="Save driver"
        className="shrink-0 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );
}
