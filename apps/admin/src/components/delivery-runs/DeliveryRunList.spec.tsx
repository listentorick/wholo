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
    requestedDeliveryDate: '2026-08-20',
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

const NOOP = {
  pendingOrderId: null,
  pendingRunId: null,
  onMove: vi.fn(),
  onMoveUpDown: vi.fn(),
  onMarkReady: vi.fn(),
  onReopen: vi.fn(),
  onSetDriver: vi.fn(),
  onChangeDate: vi.fn(),
};

// Grouped by run — each group is its own bordered section with its own
// desktop <table>, so multiple tables exist at once (Unassigned first, then
// each run in board order — buildGroups' deterministic order). MobileCardList
// (self-md:hidden) and each group's desktop <table> (hidden md:block) are
// both mounted; jsdom never applies the classes that hide one of them, same
// convention as AccountingContactsTable.spec.tsx.
describe('DeliveryRunList', () => {
  it('groups rows by run, Unassigned first', () => {
    render(<DeliveryRunList board={makeBoard()} {...NOOP} />);
    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(2);
    expect(within(tables[0]).getByText('ORD-B')).toBeInTheDocument();
    expect(within(tables[1]).getByText('ORD-A')).toBeInTheDocument();
    expect(within(tables[1]).getByText('ORD-C')).toBeInTheDocument();
  });

  it('shows the run name and status in the group header, and Unassigned + reason for the unassigned group', () => {
    render(<DeliveryRunList board={makeBoard()} {...NOOP} />);
    expect(screen.getByRole('heading', { name: 'Yorkshire' })).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unassigned' })).toBeInTheDocument();
    expect(screen.getAllByText('No delivery route').length).toBeGreaterThan(0);
  });

  it('filters to unassigned-only rows, dropping empty run groups entirely', () => {
    render(<DeliveryRunList board={makeBoard()} {...NOOP} filterUnassignedOnly />);
    expect(screen.getAllByText('ORD-B').length).toBeGreaterThan(0);
    expect(screen.queryByText('ORD-A')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Yorkshire' })).not.toBeInTheDocument();
  });

  it('shows an empty state when the filter matches nothing', () => {
    const board = makeBoard();
    board.unassigned = [];
    render(<DeliveryRunList board={board} {...NOOP} filterUnassignedOnly />);
    expect(screen.getByText('No deliveries match this filter.')).toBeInTheDocument();
  });

  it('calls onMoveUpDown with the row and direction', async () => {
    const onMoveUpDown = vi.fn();
    render(<DeliveryRunList board={makeBoard()} {...NOOP} onMoveUpDown={onMoveUpDown} />);
    // Unassigned rows have no Move up/down control; of the two run rows,
    // ORD-A is first (Move down enabled) and ORD-C is last (Move down
    // disabled) — DOM order matches, so index 0 is ORD-A's button.
    await userEvent.click(screen.getAllByLabelText('Move down')[0]);
    expect(onMoveUpDown).toHaveBeenCalledWith(
      expect.objectContaining({ card: expect.objectContaining({ orderId: 'a' }) }),
      'down',
    );
  });

  it('renders "No deliveries yet" for a run group with no cards', () => {
    const board = makeBoard();
    board.runs[0].cards = [];
    render(<DeliveryRunList board={board} {...NOOP} />);
    expect(screen.getByText('No deliveries yet')).toBeInTheDocument();
  });

  it('wires the Yorkshire group\'s Mark ready control to onMarkReady with that run\'s id', async () => {
    const onMarkReady = vi.fn().mockResolvedValue(undefined);
    render(<DeliveryRunList board={makeBoard()} {...NOOP} onMarkReady={onMarkReady} />);

    await userEvent.click(screen.getByRole('button', { name: 'Mark ready' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark ready' }));

    expect(onMarkReady).toHaveBeenCalledWith('run-1');
  });
});
