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

  it('shows an Unassigned badge and the reason line when attention is UNASSIGNED', () => {
    render(<DeliveryCard
      card={makeCard({ attention: 'UNASSIGNED', unallocatedReason: 'NO_ROUTE', stopNumber: null })}
      currentRunId={null}
      runs={[]}
      onMove={vi.fn()}
    />);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('No delivery route')).toBeInTheDocument();
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
});
