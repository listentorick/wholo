import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { ConfirmDeliverySignature } from './ConfirmDeliverySignature';
import { DeliveryLinkOrder } from '@/types/delivery';

vi.mock('./SignaturePad', () => ({
  SignaturePad: React.forwardRef(function MockSignaturePad(
    props: { onChange?: (empty: boolean) => void },
    ref: React.Ref<unknown>,
  ) {
    React.useImperativeHandle(ref, () => ({
      getData: () => ({ format: 'signature_pad', version: 5, width: 300, height: 150, strokes: [{ points: [{ x: 1, y: 1 }] }] }),
      clear: () => props.onChange?.(true),
    }));
    return React.createElement('button', { type: 'button', onClick: () => props.onChange?.(false) }, 'Draw stroke');
  }),
}));

const order: DeliveryLinkOrder = {
  orderNumber: 'ORD-2026-00330',
  distributorName: 'Blackbird Wines',
  customerName: 'Blackbird Kitchen',
  address: { line1: null, line2: null, city: null, state: null, postcode: null, country: null },
  customerPhone: null,
  deliveryInstructions: null,
  lines: [],
  state: 'PENDING',
};

describe('ConfirmDeliverySignature', () => {
  it('shows the order number and a confirmation sentence naming the customer', () => {
    render(<ConfirmDeliverySignature order={order} onAccept={vi.fn()} submitting={false} error={null} />);

    expect(screen.getByText(/Order ORD-2026-00330/i)).toBeInTheDocument();
    expect(screen.getByText(/I have received this order for Blackbird Kitchen/i)).toBeInTheDocument();
  });

  it('keeps Accept delivery disabled until the pad reports a signature, then hands back strokes + an ISO timestamp', async () => {
    const onAccept = vi.fn();
    render(<ConfirmDeliverySignature order={order} onAccept={onAccept} submitting={false} error={null} />);

    const accept = screen.getByRole('button', { name: 'Accept delivery' });
    expect(accept).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Draw stroke' }));
    expect(accept).toBeEnabled();

    await userEvent.click(accept);
    expect(onAccept).toHaveBeenCalledTimes(1);
    const [signature, capturedAt] = onAccept.mock.calls[0];
    expect(signature).toMatchObject({ format: 'signature_pad' });
    expect(new Date(capturedAt).toISOString()).toBe(capturedAt);
  });

  it('re-disables Accept delivery after Clear signature', async () => {
    render(<ConfirmDeliverySignature order={order} onAccept={vi.fn()} submitting={false} error={null} />);

    await userEvent.click(screen.getByRole('button', { name: 'Draw stroke' }));
    expect(screen.getByRole('button', { name: 'Accept delivery' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Clear signature' }));
    expect(screen.getByRole('button', { name: 'Accept delivery' })).toBeDisabled();
  });

  it('renders the error prop and shows the irreversibility caption', () => {
    render(
      <ConfirmDeliverySignature order={order} onAccept={vi.fn()} submitting={false} error="Already recorded" />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Already recorded');
    expect(screen.getByText(/can.t be changed once accepted/i)).toBeInTheDocument();
  });
});
