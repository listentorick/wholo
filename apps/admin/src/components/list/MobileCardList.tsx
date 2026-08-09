'use client';

import { useState, type ReactNode } from 'react';
import { HeaderCheckbox } from './HeaderCheckbox';

interface MobileCardListSelection {
  selectedIds: Set<string>;
  selectAllMatching: boolean;
  total: number;
  hasMore: boolean;
  onToggleRow: (id: string) => void;
  onToggleAllLoaded: (checked: boolean) => void;
  onSelectAllMatching: () => void;
}

interface MobileCardListProps<T> {
  items: T[];
  getId: (item: T) => string;
  // Plain-text name used in checkbox/header aria-labels — renderPrimary can
  // return richer markup (e.g. with an inline badge), so it can't be reused for that.
  getLabel: (item: T) => string;
  // Plural noun used in bulk-selection copy, e.g. "products", "contacts".
  entityLabelPlural: string;
  renderPrimary: (item: T) => ReactNode;
  renderSecondary: (item: T) => ReactNode;
  renderStatus: (item: T) => ReactNode;
  // Rendered as a sibling below the primary/secondary text, outside the
  // expand toggle button — for content with its own interactive controls
  // (e.g. ChangedIndicator's Acknowledge button), which can't nest inside
  // another <button>.
  renderMeta?: (item: T) => ReactNode;
  renderExpanded: (item: T) => ReactNode;
  isChanged?: (item: T) => boolean;
  selection?: MobileCardListSelection;
}

export function MobileCardList<T>({
  items,
  getId,
  getLabel,
  entityLabelPlural,
  renderPrimary,
  renderSecondary,
  renderStatus,
  renderMeta,
  renderExpanded,
  isChanged,
  selection,
}: MobileCardListProps<T>) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const loadedIds = items.map(getId);
  const allLoadedSelected = !!selection && loadedIds.length > 0 && loadedIds.every((id) => selection.selectedIds.has(id));
  const headerChecked = !!selection && (selection.selectAllMatching || allLoadedSelected);
  const headerIndeterminate = !!selection && !headerChecked && loadedIds.some((id) => selection.selectedIds.has(id));
  const showSelectAllBanner = !!selection && selection.hasMore && headerChecked && !selection.selectAllMatching;

  return (
    <ul className="divide-y divide-border md:hidden">
      {selection && (
        <li className="flex items-center gap-2.5 bg-[#fafafa] px-4 py-2.5">
          <HeaderCheckbox
            checked={headerChecked}
            indeterminate={headerIndeterminate}
            onChange={selection.onToggleAllLoaded}
            ariaLabel={`Select all loaded ${entityLabelPlural}`}
          />
          <span className="text-xs font-medium text-muted">Select all loaded</span>
        </li>
      )}
      {showSelectAllBanner && selection && (
        <li className="bg-primary/5 px-4 py-2.5 text-xs text-text">
          All {loadedIds.length} loaded {entityLabelPlural} are selected.{' '}
          <button type="button" onClick={selection.onSelectAllMatching} className="font-medium text-primary hover:underline">
            Select all {selection.total} {entityLabelPlural} matching filters
          </button>
        </li>
      )}
      {items.map((item) => {
        const id = getId(item);
        const expanded = expandedIds.has(id);
        const panelId = `mobile-card-panel-${id}`;
        const changed = isChanged?.(item) ?? false;

        return (
          <li key={id} className={changed ? 'border-l-2 border-l-amber-400' : undefined}>
            <div className="flex items-start gap-3 px-4 py-3">
              {selection && (
                <input
                  type="checkbox"
                  checked={selection.selectAllMatching || selection.selectedIds.has(id)}
                  onChange={() => selection.onToggleRow(id)}
                  className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-primary"
                  aria-label={`Select ${getLabel(item)}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => toggleExpanded(id)}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-text">{renderPrimary(item)}</p>
                    <p className="mt-0.5 break-words text-xs text-muted">{renderSecondary(item)}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {renderStatus(item)}
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      className={`h-4 w-4 flex-shrink-0 text-muted transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
                      aria-hidden
                    >
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </button>
                {renderMeta && <div className="mt-1">{renderMeta(item)}</div>}
              </div>
            </div>

            <div
              aria-hidden={!expanded}
              className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
            >
              <div className="overflow-hidden">
                <div id={panelId} className="space-y-3 border-t border-border bg-canvas/60 px-4 py-3.5">
                  {renderExpanded(item)}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
