import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeliveryCard as DeliveryCardType, DeliveryDayBoard } from '@wholo/types';
import { DeliveryRunList } from './DeliveryRunList';

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

function makeBoard(): DeliveryDayBoard {
  return {
    distributorId: 'dist-1',
    date: '2026-08-20',
    runs: [
      {
        runId: 'run-1',
        routeId: 'route-1',
        name: 'Yorkshire',
        driverName: null,
        status: 'OPEN',
        version: 0,
        cards: [
          makeCard({ orderId: 'a', customerName: 'Blackbird Kitchen', orderNumber: 'ORD-A' }),
          makeCard({ orderId: 'c', customerName: 'The Anchor', orderNumber: 'ORD-C', stopNumber: 2 }),
        ],
        stopCount: 2,
        itemCount: 44,
      },
    ],
    unassigned: [makeCard({
      orderId: 'b', orderNumber: 'ORD-B', attention: 'UNASSIGNED', unallocatedReason: 'NO_ROUTE', stopNumber: null,
    })],
  };
}

const NOOP = { pendingOrderId: null, onMove: vi.fn(), onMoveUpDown: vi.fn() };

// MobileCardList (self-md:hidden) and the desktop <table> (hidden md:block)
// are both mounted at once — jsdom never applies the Tailwind classes that
// hide one of them, so assertions must scope to one surface via
// within(screen.getByRole('table'|'list')), same convention as
// AccountingContactsTable.spec.tsx.
describe('DeliveryRunList', () => {
  it('renders one row per card, Unassigned first', () => {
    render(<DeliveryRunList board={makeBoard()} {...NOOP} />);
    const table = within(screen.getByRole('table'));
    const rows = table.getAllByText(/ORD-/);
    expect(rows.map((r) => r.textContent)).toEqual(['ORD-B', 'ORD-A', 'ORD-C']);
  });

  it('shows the run name and status for a run row, and Unassigned + reason for an unassigned row', () => {
    render(<DeliveryRunList board={makeBoard()} {...NOOP} />);
    const table = within(screen.getByRole('table'));
    expect(table.getAllByText('Yorkshire').length).toBe(2);
    expect(table.getByText('Unassigned')).toBeInTheDocument();
    expect(table.getByText('No delivery route')).toBeInTheDocument();
  });

  it('filters to unassigned-only rows when filterUnassignedOnly is set', () => {
    render(<DeliveryRunList board={makeBoard()} {...NOOP} filterUnassignedOnly />);
    const table = within(screen.getByRole('table'));
    expect(table.getByText('ORD-B')).toBeInTheDocument();
    expect(table.queryByText('ORD-A')).not.toBeInTheDocument();
  });

  it('shows an empty state when the filter matches nothing', () => {
    const board = makeBoard();
    board.unassigned = [];
    render(<DeliveryRunList board={board} {...NOOP} filterUnassignedOnly />);
    expect(screen.getByText('No deliveries match this filter.')).toBeInTheDocument();
  });

  it('calls onMoveUpDown with the row and direction', async () => {
    const onMoveUpDown = vi.fn();
    render(<DeliveryRunList board={makeBoard()} pendingOrderId={null} onMove={vi.fn()} onMoveUpDown={onMoveUpDown} />);
    const table = within(screen.getByRole('table'));
    // Unassigned rows have no Move up/down control; of the two run rows,
    // ORD-A is first (Move down enabled) and ORD-C is last (Move down
    // disabled) — DOM order matches, so index 0 is ORD-A's button.
    await userEvent.click(table.getAllByLabelText('Move down')[0]);
    expect(onMoveUpDown).toHaveBeenCalledWith(
      expect.objectContaining({ card: expect.objectContaining({ orderId: 'a' }) }),
      'down',
    );
  });
});
