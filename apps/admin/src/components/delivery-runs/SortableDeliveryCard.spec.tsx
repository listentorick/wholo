import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import type { DeliveryCard as DeliveryCardType } from '@wholo/types';
import { SortableDeliveryCard } from './SortableDeliveryCard';

function makeCard(overrides: Partial<DeliveryCardType> = {}): DeliveryCardType {
  return {
    orderId: 'order-1',
    orderNumber: 'ORD-1001',
    traderCustomerId: 'cust-1',
    customerName: 'Blackbird Kitchen',
    deliveryAddress: null,
    stopNumber: 1,
    lineCount: 4,
    itemCount: 22,
    attention: 'NONE',
    unallocatedReason: null,
    suggestedRunId: null,
    suggestedRouteName: null,
    scheduledDeliveryDate: '2026-08-20',
    allocationSource: 'DEFAULT_ROUTE',
    ...overrides,
  };
}

// useSortable/useDroppable require a DndContext + SortableContext ancestor.
function renderInContext(ui: React.ReactElement) {
  return render(
    <DndContext>
      <SortableContext items={['order-1']}>{ui}</SortableContext>
    </DndContext>,
  );
}

describe('SortableDeliveryCard', () => {
  it('renders the wrapped card content and a drag handle', () => {
    renderInContext(
      <SortableDeliveryCard card={makeCard()} columnId="run:run-1" currentRunId="run-1" runs={[]} onMove={vi.fn()} />,
    );
    expect(screen.getByText('Blackbird Kitchen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /drag to move/i })).toBeInTheDocument();
  });

  it('renders the drag handle as a distinct element from the Move to… trigger', () => {
    renderInContext(
      <SortableDeliveryCard card={makeCard()} columnId="run:run-1" currentRunId="run-1" runs={[]} onMove={vi.fn()} />,
    );
    const handle = screen.getByRole('button', { name: /drag to move/i });
    const moveMenu = screen.getByRole('button', { name: 'Move to…' });
    expect(handle).not.toBe(moveMenu);
  });
});
