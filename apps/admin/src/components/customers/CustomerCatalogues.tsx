'use client';

import { useState, useEffect, useRef } from 'react';
import { adminCataloguesApi } from '@wholo/admin-api-client';
import type { CustomerCatalogueSummary, CatalogueSummary, Catalogue } from '@wholo/types';
import { CatalogueForm } from '@/components/catalogues/CatalogueForm';

// ─── Assign-existing picker modal ─────────────────────────────────────────────

interface AssignModalProps {
  token: string;
  customerId: string;
  assignedIds: Set<string>;
  onAssign: (catalogue: CustomerCatalogueSummary[]) => void;
  onClose: () => void;
}

function AssignModal({ token, customerId, assignedIds, onAssign, onClose }: AssignModalProps) {
  const [catalogues, setCatalogues] = useState<CatalogueSummary[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    adminCataloguesApi.list(token, { limit: 200 })
      .then((r) => setCatalogues(r.data))
      .finally(() => setIsLoading(false));
  }, [token]);

  const available = catalogues.filter((c) => {
    if (assignedIds.has(c.id)) return false;
    if (!search) return true;
    return c.name.toLowerCase().includes(search.toLowerCase());
  });

  async function handleAssign(catalogueId: string) {
    setAssigning(catalogueId);
    try {
      const updated = await adminCataloguesApi.assignToCustomer(token, customerId, catalogueId);
      onAssign(updated);
      onClose();
    } catch {
      setAssigning(null);
    }
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={handleOverlayClick}
    >
      <div
        className="relative flex flex-col bg-white rounded-xl shadow-2xl w-full max-w-md"
        style={{ maxHeight: '75vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-text">Assign catalogue</h3>
            <p className="text-xs text-muted mt-0.5">Pick a catalogue to assign to this customer</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-text transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-border shrink-0">
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-muted">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search catalogues…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text placeholder-muted/60 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
            </div>
          ) : available.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
              <p className="text-sm text-muted">
                {search
                  ? `No catalogues match "${search}"`
                  : assignedIds.size > 0
                  ? 'All catalogues are already assigned to this customer'
                  : 'No catalogues found. Create one first.'}
              </p>
            </div>
          ) : (
            <ul>
              {available.map((catalogue) => (
                <li
                  key={catalogue.id}
                  className="flex items-center justify-between px-5 py-3.5 border-b border-border/60 last:border-0 hover:bg-surface transition-colors"
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="text-sm font-medium text-text truncate">{catalogue.name}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {catalogue._count.products} product{catalogue._count.products !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAssign(catalogue.id)}
                    disabled={assigning === catalogue.id}
                    className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
                  >
                    {assigning === catalogue.id ? 'Assigning…' : 'Assign'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create-new drawer (slides in from right) ─────────────────────────────────

interface CreateDrawerProps {
  token: string;
  customerId: string;
  onCreated: (catalogue: CustomerCatalogueSummary[]) => void;
  onClose: () => void;
}

function CreateDrawer({ token, customerId, onCreated, onClose }: CreateDrawerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger slide-in after mount
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  async function handleSuccess(catalogue: Catalogue) {
    try {
      const updated = await adminCataloguesApi.assignToCustomer(token, customerId, catalogue.id);
      onCreated(updated);
    } catch {
      // Catalogue was created; assignment failed silently — user can assign manually
      onCreated([{ id: catalogue.id, name: catalogue.name, description: catalogue.description, _count: { products: catalogue.products.length } }]);
    }
    handleClose();
  }

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{ backgroundColor: 'rgba(0,0,0,0.35)', opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />

      {/* Drawer panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl overflow-y-auto transition-transform duration-300 ease-out"
        style={{
          width: 'min(600px, 95vw)',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        <div className="flex-1 p-6">
          <CatalogueForm
            mode="create"
            token={token}
            onSuccess={handleSuccess}
            onCancel={handleClose}
          />
        </div>
      </div>
    </>
  );
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

function CataloguePill({ catalogue, onRemove, isRemoving }: {
  catalogue: CustomerCatalogueSummary;
  onRemove: (id: string) => void;
  isRemoving: boolean;
}) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text transition-opacity',
        isRemoving ? 'opacity-40' : '',
      ].join(' ')}
    >
      <span className="max-w-[140px] truncate">{catalogue.name}</span>
      <span className="text-muted/60 text-xs">
        {catalogue._count.products}
      </span>
      <button
        type="button"
        onClick={() => onRemove(catalogue.id)}
        disabled={isRemoving}
        className="ml-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-muted hover:bg-border hover:text-text transition-colors disabled:cursor-not-allowed"
        aria-label={`Remove ${catalogue.name}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-2.5 w-2.5">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CustomerCataloguesProps {
  customerId: string;
  token: string;
}

export function CustomerCatalogues({ customerId, token }: CustomerCataloguesProps) {
  const [assigned, setAssigned] = useState<CustomerCatalogueSummary[]>([]);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);

  useEffect(() => {
    adminCataloguesApi.getCustomerCatalogues(token, customerId)
      .then(setAssigned)
      .finally(() => setIsLoading(false));
  }, [token, customerId]);

  async function handleRemove(catalogueId: string) {
    setRemovingIds((prev) => new Set(prev).add(catalogueId));
    const previous = assigned;
    setAssigned((prev) => prev.filter((c) => c.id !== catalogueId));
    try {
      await adminCataloguesApi.unassignFromCustomer(token, customerId, catalogueId);
    } catch {
      setAssigned(previous);
    }
    setRemovingIds((prev) => {
      const next = new Set(prev);
      next.delete(catalogueId);
      return next;
    });
  }

  const assignedIds = new Set(assigned.map((c) => c.id));

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
        <span className="text-xs text-muted">Loading catalogues…</span>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {assigned.length === 0 ? (
          <p className="text-sm text-muted">No catalogues assigned. This customer won't see any products.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {assigned.map((catalogue) => (
              <CataloguePill
                key={catalogue.id}
                catalogue={catalogue}
                onRemove={handleRemove}
                isRemoving={removingIds.has(catalogue.id)}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setShowAssignModal(true)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface hover:border-muted/40"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 text-muted">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Assign catalogue
          </button>
          <button
            type="button"
            onClick={() => setShowCreateDrawer(true)}
            className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-[#fff8f3] px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-[#feecdf]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Create new catalogue
          </button>
        </div>
      </div>

      {showAssignModal && (
        <AssignModal
          token={token}
          customerId={customerId}
          assignedIds={assignedIds}
          onAssign={(updated) => setAssigned(updated)}
          onClose={() => setShowAssignModal(false)}
        />
      )}

      {showCreateDrawer && (
        <CreateDrawer
          token={token}
          customerId={customerId}
          onCreated={(updated) => setAssigned(updated)}
          onClose={() => setShowCreateDrawer(false)}
        />
      )}
    </>
  );
}
