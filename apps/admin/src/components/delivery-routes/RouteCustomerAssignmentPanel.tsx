'use client';

import { useState } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { adminDeliveryRoutesApi } from '@wholo/admin-api-client';
import type { DeliveryRouteCustomer } from '@wholo/types';
import { CustomerSearchSelect } from './CustomerSearchSelect';

interface Props {
  routeId: string;
  token: string;
  customers: DeliveryRouteCustomer[];
  onCustomersChange: (customers: DeliveryRouteCustomer[]) => void;
}

function formatAddress(rc: DeliveryRouteCustomer) {
  const parts = [rc.deliveryAddress?.addressLine1, rc.deliveryAddress?.addressCity, rc.deliveryAddress?.addressPostcode]
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : '—';
}

// Every reorder/remove action here has a non-drag equivalent (Move up/down
// buttons, a Remove button) — dnd-kit's keyboard sensor also works, but its
// pick-up/arrow-keys/drop flow isn't self-evidently discoverable, so the
// always-visible buttons are the primary AC12 mechanism, not a fallback.
function CustomerRow({
  routeCustomer,
  isFirst,
  isLast,
  onMove,
  onRemove,
  removing,
}: {
  routeCustomer: DeliveryRouteCustomer;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: 'up' | 'down') => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: routeCustomer.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center gap-3 rounded-md border border-border bg-white px-3 py-2.5',
        isDragging ? 'opacity-50' : '',
      ].join(' ')}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${routeCustomer.customerName ?? 'customer'}`}
        className="cursor-grab touch-none text-muted hover:text-text active:cursor-grabbing"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>

      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => onMove('up')}
          disabled={isFirst}
          aria-label="Move up"
          className="text-muted hover:text-text disabled:opacity-25 disabled:hover:text-muted"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onMove('down')}
          disabled={isLast}
          aria-label="Move down"
          className="text-muted hover:text-text disabled:opacity-25 disabled:hover:text-muted"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border text-xs font-medium text-text">
        {routeCustomer.defaultDropPosition}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{routeCustomer.customerName ?? routeCustomer.customerId}</p>
        <p className="truncate text-xs text-muted">{formatAddress(routeCustomer)}</p>
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        className="flex-shrink-0 text-xs text-red-500 hover:underline disabled:opacity-50"
      >
        {removing ? 'Removing…' : 'Remove'}
      </button>
    </div>
  );
}

export function RouteCustomerAssignmentPanel({ routeId, token, customers, onCustomersChange }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function persistOrder(next: DeliveryRouteCustomer[]) {
    const previous = customers;
    const renumbered = next.map((rc, i) => ({ ...rc, defaultDropPosition: i + 1 }));
    onCustomersChange(renumbered);
    setReorderError(null);
    try {
      const saved = await adminDeliveryRoutesApi.reorderCustomers(token, routeId, {
        orderedCustomerIds: renumbered.map((rc) => rc.customerId),
      });
      onCustomersChange(saved);
    } catch {
      onCustomersChange(previous);
      setReorderError('Failed to save the new order. Please try again.');
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = customers.findIndex((c) => c.id === active.id);
    const newIndex = customers.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    persistOrder(arrayMove(customers, oldIndex, newIndex));
  }

  function handleMove(id: string, direction: 'up' | 'down') {
    const index = customers.findIndex((c) => c.id === id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || targetIndex < 0 || targetIndex >= customers.length) return;
    persistOrder(arrayMove(customers, index, targetIndex));
  }

  async function handleRemove(routeCustomer: DeliveryRouteCustomer) {
    setRemovingId(routeCustomer.id);
    try {
      await adminDeliveryRoutesApi.removeCustomer(token, routeId, routeCustomer.customerId);
      onCustomersChange(customers.filter((c) => c.id !== routeCustomer.id));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text">Customers on this route</p>
          <p className="text-xs text-muted">Drag to set drop order, or use the arrows — only customers with an order appear in a dated run.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex-shrink-0 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
        >
          + Add customers
        </button>
      </div>

      {reorderError && <p className="text-xs text-red-600">{reorderError}</p>}

      {customers.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
          No customers assigned yet.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={customers.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {customers.map((rc, i) => (
                <CustomerRow
                  key={rc.id}
                  routeCustomer={rc}
                  isFirst={i === 0}
                  isLast={i === customers.length - 1}
                  onMove={(direction) => handleMove(rc.id, direction)}
                  onRemove={() => handleRemove(rc)}
                  removing={removingId === rc.id}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {showAdd && (
        <CustomerSearchSelect
          routeId={routeId}
          token={token}
          existingCustomerIds={customers.map((c) => c.customerId)}
          onClose={() => setShowAdd(false)}
          onAssigned={(added) => {
            onCustomersChange([...customers, added]);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}
