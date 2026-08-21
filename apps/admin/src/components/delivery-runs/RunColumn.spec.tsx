import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeliveryCard as DeliveryCardType, DeliveryRunColumn } from '@wholo/types';
import { RunColumn } from './RunColumn';

// A READY run renders DriverManifestButton (via RunHeaderControls), which
// reads useAuth() on every render, not just on click.
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'token-1' }),
}));

function makeRun(overrides: Partial<DeliveryRunColumn> = {}): DeliveryRunColumn {
  return {
    runId: 'run-1',
    routeId: 'route-1',
    name: 'Yorkshire',
    driverName: 'Dave Walsh',
    status: 'OPEN',
    version: 0,
    cards: [],
    stopCount: 0,
    itemCount: 0,
    ...overrides,
  };
}

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

const NOOP = {
  pendingOrderId: null,
  pendingRunId: null,
  onMove: vi.fn(),
  onReorder: vi.fn(),
  onMarkReady: vi.fn(),
  onReopen: vi.fn(),
  onSetDriver: vi.fn(),
  onChangeDate: vi.fn(),
};

describe('RunColumn', () => {
  it('renders the run name and driver', () => {
    render(<RunColumn run={makeRun()} allRuns={[]} {...NOOP} />);
    expect(screen.getByText('Yorkshire')).toBeInTheDocument();
    expect(screen.getByText('Dave Walsh')).toBeInTheDocument();
  });

  it('shows "No driver assigned" when driverName is null', () => {
    render(<RunColumn run={makeRun({ driverName: null })} allRuns={[]} {...NOOP} />);
    expect(screen.getByText('No driver assigned')).toBeInTheDocument();
  });

  it('shows an Open badge for an OPEN run', () => {
    render(<RunColumn run={makeRun({ status: 'OPEN' })} allRuns={[]} {...NOOP} />);
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('shows a Ready badge for a READY run', () => {
    render(<RunColumn run={makeRun({ status: 'READY' })} allRuns={[]} {...NOOP} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no cards', () => {
    render(<RunColumn run={makeRun({ cards: [] })} allRuns={[]} {...NOOP} />);
    expect(screen.getByText('No deliveries yet')).toBeInTheDocument();
  });

  it('renders the stop/item totals footer', () => {
    render(<RunColumn run={makeRun({ stopCount: 6, itemCount: 118 })} allRuns={[]} {...NOOP} />);
    expect(screen.getByText('6 stops · 118 items')).toBeInTheDocument();
  });

  it('calls onReorder with the swapped order when Move down is clicked', async () => {
    const onReorder = vi.fn();
    const run = makeRun({ cards: [makeCard({ orderId: 'a' }), makeCard({ orderId: 'b' })] });
    render(<RunColumn run={run} allRuns={[]} {...NOOP} onReorder={onReorder} />);

    await userEvent.click(screen.getAllByLabelText('Move down')[0]);

    expect(onReorder).toHaveBeenCalledWith('run-1', ['b', 'a']);
  });

  it('disables every card\'s controls when the run is READY', () => {
    const run = makeRun({ status: 'READY', cards: [makeCard()] });
    render(<RunColumn run={run} allRuns={[]} {...NOOP} />);
    expect(screen.getByRole('button', { name: 'Move to…' })).toBeDisabled();
  });
});
