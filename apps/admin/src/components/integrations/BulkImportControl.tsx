'use client';

import { useEffect, useRef, useState } from 'react';
import type { BulkImportJobResponse } from '@wholo/types';

interface SelectionDto {
  ids?: string[];
  filter?: Record<string, unknown>;
  honourSuggestions: boolean;
}

interface Props {
  entityLabel: string; // e.g. 'products' | 'contacts' — used in button/summary copy
  selectedCount: number;
  buildDto: (honourSuggestions: boolean) => SelectionDto;
  bulkImport: (dto: SelectionDto) => Promise<BulkImportJobResponse>;
  onQueued: () => void;
}

// Generic across accounting record types (products/contacts share this one
// component, parameterized by entityLabel/buildDto/bulkImport) — not generic
// across integration families, which would be a speculative abstraction with
// no second consumer yet. Popover follows the same click-away pattern as
// FilterBar/FilterPopover; the queued-toast mirrors SyncNowButton.
export function BulkImportControl({ entityLabel, selectedCount, buildDto, bulkImport, onQueued }: Props) {
  const [open, setOpen] = useState(false);
  const [honourSuggestions, setHonourSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  useEffect(() => {
    if (!queued) return;
    const t = setTimeout(() => setQueued(false), 5000);
    return () => clearTimeout(t);
  }, [queued]);

  async function handleImport() {
    setSubmitting(true);
    setError(null);
    try {
      await bulkImport(buildDto(honourSuggestions));
      setOpen(false);
      setQueued(true);
      setHonourSuggestions(false);
      onQueued();
    } catch {
      setError('Failed to queue the import. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = selectedCount === 0;

  return (
    <div ref={containerRef} className="relative flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="rounded-md border border-border bg-white px-3.5 py-2 text-sm font-medium text-text transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
      >
        Bulk import{selectedCount > 0 ? ` (${selectedCount})` : ''}
      </button>
      {queued && <span className="text-xs text-muted">Import queued — you&apos;ll be notified when it&apos;s done.</span>}
      {error && !open && <span className="text-xs text-red-600">{error}</span>}

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-lg border border-border bg-white shadow-lg border-l-[3px] border-l-primary">
          <div className="p-4 space-y-3">
            <p className="text-sm text-text">
              Import {selectedCount} {entityLabel} as new by default.
            </p>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={honourSuggestions}
                onChange={(e) => setHonourSuggestions(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-primary"
              />
              <span className="text-sm text-text">
                Honour suggested matches
                <span className="block text-xs text-muted">
                  Rows with a suggested match will be linked instead of creating a duplicate.
                </span>
              </span>
            </label>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={submitting}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {submitting ? 'Queuing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
