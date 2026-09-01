'use client';

import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';

interface QuantityStepperProps {
  value: number;
  /** Floor for both the ± buttons and typed entry — 0 on catalogue/detail, 1 on checkout (where removal is a separate control). */
  min: number;
  disabled?: boolean;
  saving?: boolean;
  /** Always the absolute next quantity, already clamped to `min`. */
  onChange: (next: number) => void;
  /** Product name — drives per-item accessible names so a screen reader can tell steppers apart. */
  itemLabel: string;
  className?: string;
}

const buttonBase =
  'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-border bg-transparent p-0 text-muted transition-colors hover:border-accent hover:text-accent active:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent';

/** Round ± buttons flanking a tap-to-edit numeric field. Buttons and field both commit through the same absolute-value onChange. */
export function QuantityStepper({
  value,
  min,
  disabled = false,
  saving = false,
  onChange,
  itemLabel,
  className,
}: QuantityStepperProps) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);

  // Resync from an external (e.g. optimistic cart) update, but never while the user is mid-edit.
  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = parseInt(draft, 10);
    const clamped = Number.isNaN(parsed) ? min : Math.max(min, parsed);
    if (clamped !== value) onChange(clamped);
    setDraft(String(clamped));
  };

  const isDisabled = disabled || saving;

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <button
        type="button"
        className={buttonBase}
        aria-label={`Decrease quantity for ${itemLabel}`}
        disabled={isDisabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={`Quantity for ${itemLabel}`}
        className="w-10 min-w-[40px] rounded-md border border-border bg-white px-1 py-1.5 text-center text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:cursor-not-allowed disabled:opacity-40"
        value={draft}
        disabled={isDisabled}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onKeyDown={(e) => {
          // blur() triggers onBlur synchronously, which commits — don't also commit here, or Enter double-fires onChange.
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />

      <button
        type="button"
        className={buttonBase}
        aria-label={`Increase quantity for ${itemLabel}`}
        disabled={isDisabled}
        onClick={() => onChange(value + 1)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}
