'use client';

import { useEffect, useRef } from 'react';

interface HeaderCheckboxProps {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}

// Native <input> has no `indeterminate` prop — it's a DOM-only property, so
// it has to be set imperatively via a ref rather than through JSX.
export function HeaderCheckbox({ checked, indeterminate, onChange, ariaLabel }: HeaderCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-3.5 w-3.5 accent-primary"
      aria-label={ariaLabel}
    />
  );
}
