import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReschedulePreviewResponse } from '@wholo/types';
import { ChangeDeliveryDateDialog } from './ChangeDeliveryDateDialog';

const mockGetReschedulePreview = vi.fn<() => Promise<ReschedulePreviewResponse>>();

vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return {
    ...actual,
    adminDeliveryRunsApi: {
      ...actual.adminDeliveryRunsApi,
      getReschedulePreview: (...args: unknown[]) => mockGetReschedulePreview(...(args as [])),
    },
  };
});

const DEFAULT_PROPS = {
  token: 'test-token',
  orderId: 'order-1',
  orderNumber: 'ORD-1001',
  customerName: 'Blackbird Kitchen',
  currentScheduledDeliveryDate: '2026-08-20',
  requestedDeliveryDate: '2026-08-20',
  submitting: false,
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
};

beforeEach(() => {
  mockGetReschedulePreview.mockReset();
  mockGetReschedulePreview.mockResolvedValue({
    resolution: { allocated: true, runId: 'run-1', runName: 'Yorkshire' },
    nearbyDeliveries: [],
  });
});

describe('ChangeDeliveryDateDialog', () => {
  it('shows the order/customer context and the originally-requested date', () => {
    render(<ChangeDeliveryDateDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText('Blackbird Kitchen · ORD-1001')).toBeInTheDocument();
    expect(screen.getByText('Originally requested: 20 Aug')).toBeInTheDocument();
  });

  it('disables Save when the date is unchanged from the current one', () => {
    render(<ChangeDeliveryDateDialog {...DEFAULT_PROPS} />);
    expect(screen.getByText('Save date')).toBeDisabled();
  });

  it('shows a drift note when the picked date differs from the requested date, and enables Save', async () => {
    render(<ChangeDeliveryDateDialog {...DEFAULT_PROPS} />);
    const input = screen.getByLabelText('New delivery date');
    await userEvent.clear(input);
    await userEvent.type(input, '2026-08-25');

    expect(await screen.findByText(/Differs from the customer’s requested date \(20 Aug\)/)).toBeInTheDocument();
    expect(screen.getByText('Save date')).not.toBeDisabled();
  });

  it('never shows a drift note when the picked date still matches the requested date', () => {
    render(<ChangeDeliveryDateDialog {...DEFAULT_PROPS} currentScheduledDeliveryDate="2026-08-18" />);
    expect(screen.queryByText(/Differs from the customer/)).not.toBeInTheDocument();
  });

  it('disables Save and shows the reason when the resolved destination run is already READY', async () => {
    mockGetReschedulePreview.mockResolvedValue({
      resolution: { allocated: false, reason: 'RUN_READY' },
      nearbyDeliveries: [],
    });
    render(<ChangeDeliveryDateDialog {...DEFAULT_PROPS} />);
    const input = screen.getByLabelText('New delivery date');
    await userEvent.clear(input);
    await userEvent.type(input, '2026-08-25');

    await waitFor(() => expect(screen.getByText('Run already marked ready')).toBeInTheDocument());
    expect(screen.getByText('Save date')).toBeDisabled();
  });

  it('renders the nearby-deliveries panel only when the preview returns matches', async () => {
    mockGetReschedulePreview.mockResolvedValue({
      resolution: { allocated: true, runId: null, runName: 'Yorkshire' },
      nearbyDeliveries: [{
        orderId: 'order-2', orderNumber: 'ORD-2', customerName: 'Old Mill', scheduledDeliveryDate: '2026-08-24', runId: null, runName: null,
      }],
    });
    render(<ChangeDeliveryDateDialog {...DEFAULT_PROPS} />);
    const input = screen.getByLabelText('New delivery date');
    await userEvent.clear(input);
    await userEvent.type(input, '2026-08-25');

    expect(await screen.findByText('Other deliveries at this address')).toBeInTheDocument();
    expect(screen.getByText('Old Mill · ORD-2')).toBeInTheDocument();
  });

  it('renders no nearby-deliveries panel when the preview returns none', () => {
    render(<ChangeDeliveryDateDialog {...DEFAULT_PROPS} />);
    expect(screen.queryByText('Other deliveries at this address')).not.toBeInTheDocument();
  });

  it('calls onConfirm with the new and expected dates when Save is clicked', async () => {
    const onConfirm = vi.fn();
    render(<ChangeDeliveryDateDialog {...DEFAULT_PROPS} onConfirm={onConfirm} />);
    const input = screen.getByLabelText('New delivery date');
    await userEvent.clear(input);
    await userEvent.type(input, '2026-08-25');

    await waitFor(() => expect(screen.getByText('Save date')).not.toBeDisabled());
    await userEvent.click(screen.getByText('Save date'));

    expect(onConfirm).toHaveBeenCalledWith({ scheduledDeliveryDate: '2026-08-25', expectedScheduledDeliveryDate: '2026-08-20' });
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    render(<ChangeDeliveryDateDialog {...DEFAULT_PROPS} onCancel={onCancel} />);
    await userEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
