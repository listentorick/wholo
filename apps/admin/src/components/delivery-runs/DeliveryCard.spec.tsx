import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeliveryCard as DeliveryCardType, DeliveryRunColumn } from '@wholo/types';
import { DeliveryCard } from './DeliveryCard';

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

function makeRun(overrides: Partial<DeliveryRunColumn> = {}): DeliveryRunColumn {
  return {
    runId: 'run-1',
    routeId: 'route-1',
    name: 'Yorkshire',
    driverName: null,
    status: 'OPEN',
    version: 0,
    cards: [],
    stopCount: 0,
    itemCount: 0,
    ...overrides,
  };
}

describe('DeliveryCard', () => {
  it('renders the customer name, order number, and stop number', () => {
    render(<DeliveryCard card={makeCard({ stopNumber: 3 })} currentRunId="run-1" runs={[]} onMove={vi.fn()} />);
    expect(screen.getByText('Blackbird Kitchen')).toBeInTheDocument();
    expect(screen.getByText('ORD-1001')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows lines/items, never "cases"', () => {
    render(<DeliveryCard card={makeCard()} currentRunId="run-1" runs={[]} onMove={vi.fn()} />);
    expect(screen.getByText('4 lines · 22 items')).toBeInTheDocument();
  });

  it('shows no Unassigned badge — the column header already says that', () => {
    render(<DeliveryCard
      card={makeCard({ attention: 'UNASSIGNED', unallocatedReason: 'NO_ROUTE', stopNumber: null })}
      currentRunId={null}
      runs={[]}
      onMove={vi.fn()}
    />);
    expect(screen.queryByText('Unassigned')).not.toBeInTheDocument();
  });

  it('shows the unallocated-reason line when there is a real reason', () => {
    render(<DeliveryCard
      card={makeCard({ attention: 'UNASSIGNED', unallocatedReason: 'NO_ROUTE', stopNumber: null })}
      currentRunId={null}
      runs={[]}
      onMove={vi.fn()}
    />);
    expect(screen.getByText('No delivery route')).toBeInTheDocument();
  });

  it('hides the reason line for the no-real-reason case, instead of showing filler copy', () => {
    render(<DeliveryCard
      card={makeCard({ attention: 'UNASSIGNED', unallocatedReason: null, stopNumber: null })}
      currentRunId={null}
      runs={[]}
      onMove={vi.fn()}
    />);
    expect(screen.queryByText('Ready to assign')).not.toBeInTheDocument();
  });

  it('renders no stop-number badge when unassigned', () => {
    render(<DeliveryCard
      card={makeCard({ attention: 'UNASSIGNED', stopNumber: null })}
      currentRunId={null}
      runs={[]}
      onMove={vi.fn()}
    />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('always renders the Move to… trigger, without requiring hover', () => {
    render(<DeliveryCard card={makeCard()} currentRunId="run-1" runs={[makeRun()]} onMove={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Move to…' })).toBeInTheDocument();
  });

  it('renders Move up/down buttons only when onMoveUpDown is provided (run cards, not unassigned)', () => {
    const { rerender } = render(
      <DeliveryCard card={makeCard()} currentRunId={null} runs={[]} onMove={vi.fn()} />,
    );
    expect(screen.queryByLabelText('Move up')).not.toBeInTheDocument();

    rerender(
      <DeliveryCard card={makeCard()} currentRunId="run-1" runs={[]} onMove={vi.fn()} onMoveUpDown={vi.fn()} />,
    );
    expect(screen.getByLabelText('Move up')).toBeInTheDocument();
    expect(screen.getByLabelText('Move down')).toBeInTheDocument();
  });

  it('disables Move up at the first position and Move down at the last', () => {
    render(
      <DeliveryCard
        card={makeCard()}
        currentRunId="run-1"
        runs={[]}
        isFirst
        isLast={false}
        onMove={vi.fn()}
        onMoveUpDown={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Move up')).toBeDisabled();
    expect(screen.getByLabelText('Move down')).not.toBeDisabled();
  });

  it('disables every control when locked (READY run)', () => {
    render(
      <DeliveryCard card={makeCard()} currentRunId="run-1" runs={[]} locked onMove={vi.fn()} onMoveUpDown={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Move to…' })).toBeDisabled();
    expect(screen.getByLabelText('Move up')).toBeDisabled();
    expect(screen.getByLabelText('Move down')).toBeDisabled();
  });

  it('calls onMove with the selected run id when a menu item is picked', async () => {
    const onMove = vi.fn();
    render(
      <DeliveryCard card={makeCard()} currentRunId={null} runs={[makeRun({ runId: 'run-2', name: 'Lancashire' })]} onMove={onMove} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Move to…' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Lancashire' }));
    expect(onMove).toHaveBeenCalledWith('run-2');
  });

  it('shows the Missed chip (replacing the stop-number badge) and the amber left border for a missed card', () => {
    render(
      <DeliveryCard
        card={makeCard({
          attention: 'MISSED', stopNumber: null, scheduledDeliveryDate: '2026-08-12',
        })}
        currentRunId={null}
        runs={[]}
        onMove={vi.fn()}
      />,
    );
    expect(screen.getByText('Missed — was due 12 Aug')).toBeInTheDocument();
  });

  it('promotes a leading amber "Reschedule" button on a missed card instead of a plain icon button', async () => {
    const onChangeDate = vi.fn();
    render(
      <DeliveryCard
        card={makeCard({ attention: 'MISSED', stopNumber: null })}
        currentRunId={null}
        runs={[]}
        onMove={vi.fn()}
        onChangeDate={onChangeDate}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
    expect(onChangeDate).toHaveBeenCalled();
    expect(screen.queryByLabelText('Change delivery date')).not.toBeInTheDocument();
  });

  it('renders a plain Change-delivery-date icon button on a non-missed card when onChangeDate is provided', async () => {
    const onChangeDate = vi.fn();
    render(<DeliveryCard card={makeCard()} currentRunId="run-1" runs={[]} onMove={vi.fn()} onChangeDate={onChangeDate} />);
    await userEvent.click(screen.getByLabelText('Change delivery date'));
    expect(onChangeDate).toHaveBeenCalled();
  });
});
