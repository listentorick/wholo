'use client';

import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import type { DeliveryRunColumn } from '@wholo/types';

interface MoveToMenuProps {
  currentRunId: string | null;
  runs: DeliveryRunColumn[];
  suggestedRunId?: string | null;
  disabled?: boolean;
  onSelect: (targetRunId: string | null) => void;
}

// A plain always-visible button, not a hover affordance — dnd-kit's
// keyboard sensor works but its pick-up/arrow/drop flow isn't
// self-evidently discoverable, so this is the primary move path (AC12),
// not a fallback. Portals to document.body (same escape mechanism as
// Modal/Drawer) since it renders inside the board's own overflow-x-auto
// scroller and would otherwise clip.
export function MoveToMenu({
  currentRunId, runs, suggestedRunId, disabled, onSelect,
}: MoveToMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // The board scrolls horizontally inside its own container — closing on
    // any scroll (capture, so nested scrollers are caught too) is simpler
    // and more robust than re-anchoring the portal mid-scroll.
    const onScroll = () => setOpen(false);

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 4, left: rect.left });
    setOpen(true);
  }

  const otherRuns = runs
    .filter((run) => run.runId !== currentRunId)
    .sort((a, b) => {
      if (a.runId === suggestedRunId) return -1;
      if (b.runId === suggestedRunId) return 1;
      return 0;
    });

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className="rounded-md border border-border px-2 py-1 text-xs font-medium text-text hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
      >
        Move to…
      </button>
      {open && position && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: position.top, left: position.left }}
          className="z-50 w-56 rounded-md border border-border bg-white py-1 shadow-lg"
        >
          {currentRunId !== null && (
            <button
              type="button"
              role="menuitem"
              onClick={() => { onSelect(null); setOpen(false); }}
              className="block w-full px-3 py-1.5 text-left text-sm text-text hover:bg-canvas"
            >
              Unassigned
            </button>
          )}
          {otherRuns.length === 0 && currentRunId === null ? (
            <p className="px-3 py-1.5 text-sm text-muted">No open runs yet</p>
          ) : (
            otherRuns.map((run) => {
              const isReady = run.status === 'READY';
              return (
                <button
                  key={run.runId}
                  type="button"
                  role="menuitem"
                  disabled={isReady}
                  title={isReady ? 'Run already marked ready' : undefined}
                  onClick={() => { onSelect(run.runId); setOpen(false); }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-text hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <span className="truncate">{run.name}</span>
                  {run.runId === suggestedRunId && (
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-primary">Suggested</span>
                  )}
                </button>
              );
            })
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
