import type { DeliveryAttention, DeliveryRunColumn } from '@wholo/types';
import { MoveToMenu } from './MoveToMenu';

interface DeliveryCardActionsProps {
  currentRunId: string | null;
  runs: DeliveryRunColumn[];
  suggestedRunId: string | null;
  // Drives the Change-date button's label/position: MISSED promotes it to a
  // leading, amber-tinted "Reschedule" — the primary resolution for a missed
  // delivery — instead of a plain trailing icon button.
  attention?: DeliveryAttention;
  disabled?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onMove: (targetRunId: string | null) => void;
  onMoveUpDown?: (direction: 'up' | 'down') => void;
  onChangeDate?: () => void;
}

// MoveToMenu + Move up/down + Change date, shared between the board's
// DeliveryCard footer and DeliveryRunList's row actions so the views can't
// drift.
export function DeliveryCardActions({
  currentRunId, runs, suggestedRunId, attention, disabled, isFirst, isLast, onMove, onMoveUpDown, onChangeDate,
}: DeliveryCardActionsProps) {
  const isMissed = attention === 'MISSED';
  return (
    <div className="flex items-center gap-1.5">
      {isMissed && onChangeDate && (
        <button
          type="button"
          onClick={onChangeDate}
          disabled={disabled}
          className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reschedule
        </button>
      )}
      <MoveToMenu
        currentRunId={currentRunId}
        runs={runs}
        suggestedRunId={suggestedRunId}
        disabled={disabled}
        onSelect={onMove}
      />
      {!isMissed && onChangeDate && (
        <button
          type="button"
          onClick={onChangeDate}
          disabled={disabled}
          aria-label="Change delivery date"
          title="Change delivery date"
          className="rounded p-1 text-muted hover:bg-canvas hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
          </svg>
        </button>
      )}
      {onMoveUpDown && (
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMoveUpDown('up')}
            disabled={disabled || isFirst}
            aria-label="Move up"
            className="rounded p-1 text-muted hover:bg-canvas hover:text-text disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-muted"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onMoveUpDown('down')}
            disabled={disabled || isLast}
            aria-label="Move down"
            className="rounded p-1 text-muted hover:bg-canvas hover:text-text disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-muted"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
