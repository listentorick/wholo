import type { DeliveryRunColumn } from '@wholo/types';
import { MoveToMenu } from './MoveToMenu';

interface DeliveryCardActionsProps {
  currentRunId: string | null;
  runs: DeliveryRunColumn[];
  suggestedRunId: string | null;
  disabled?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onMove: (targetRunId: string | null) => void;
  onMoveUpDown?: (direction: 'up' | 'down') => void;
}

// MoveToMenu + Move up/down, shared between the board's DeliveryCard footer
// and DeliveryRunList's row actions so the two views can't drift.
export function DeliveryCardActions({
  currentRunId, runs, suggestedRunId, disabled, isFirst, isLast, onMove, onMoveUpDown,
}: DeliveryCardActionsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <MoveToMenu
        currentRunId={currentRunId}
        runs={runs}
        suggestedRunId={suggestedRunId}
        disabled={disabled}
        onSelect={onMove}
      />
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
