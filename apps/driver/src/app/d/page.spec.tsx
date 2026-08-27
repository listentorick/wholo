import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeliveryPage from './page';
import * as deliveryApi from '@/lib/delivery-api';
import { DeliveryLinkOrder } from '@/types/delivery';

vi.mock('@/lib/delivery-api', async () => {
  const actual = await vi.importActual<typeof deliveryApi>('@/lib/delivery-api');
  return {
    ...actual,
    getDeliveryOrder: vi.fn(),
    submitDeliveryOutcome: vi.fn(),
  };
});

// The real SignaturePad needs a canvas 2D context jsdom doesn't provide. Stand
// in a button that toggles the "not empty" state and hands back fixed strokes.
vi.mock('@/components/delivery/SignaturePad', async () => {
  const React = await import('react');
  return {
    SignaturePad: React.forwardRef(function MockSignaturePad(
      props: { onChange?: (empty: boolean) => void },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({
        getData: () => ({ format: 'signature_pad', version: 5, width: 300, height: 150, strokes: [{ points: [{ x: 1, y: 1 }] }] }),
        clear: () => props.onChange?.(true),
      }));
      return React.createElement(
        'button',
        { type: 'button', onClick: () => props.onChange?.(false) },
        'Add signature stroke',
      );
    }),
  };
});

const pendingOrder: DeliveryLinkOrder = {
  orderNumber: '10428',
  distributorName: 'Blackbird Wines',
  customerName: 'The Old Hall',
  address: { line1: '8 High Street', line2: null, city: 'Halifax', state: null, postcode: 'HX1 2AB', country: 'GB' },
  customerPhone: '07700 900123',
  deliveryInstructions: null,
  lines: [{ productName: 'Rioja Crianza', quantity: 3 }],
  state: 'PENDING',
};

const submittedOrder: DeliveryLinkOrder = {
  ...pendingOrder,
  state: 'SUBMITTED',
  outcome: { outcome: 'DELIVERED', recordedAt: '2026-08-25T14:32:00Z', driverName: 'Alex Turner' },
};

function setHash(hash: string) {
  window.location.hash = hash;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('DeliveryPage', () => {
  it('shows the unavailable state when there is no token in the URL fragment', async () => {
    setHash('');
    render(<DeliveryPage />);

    await waitFor(() => expect(screen.getByText(/delivery link isn.t available/i)).toBeInTheDocument());
    expect(deliveryApi.getDeliveryOrder).not.toHaveBeenCalled();
  });

  it('fetches using the token from the fragment, never a request to a URL containing it', async () => {
    setHash('#order-1.sig');
    vi.mocked(deliveryApi.getDeliveryOrder).mockResolvedValue(pendingOrder);

    render(<DeliveryPage />);

    await waitFor(() => expect(deliveryApi.getDeliveryOrder).toHaveBeenCalledWith('order-1.sig'));
    expect(await screen.findByText('The Old Hall')).toBeInTheDocument();
  });

  it('shows the unavailable state on a 404/410 from the API', async () => {
    setHash('#order-1.sig');
    vi.mocked(deliveryApi.getDeliveryOrder).mockRejectedValue(new deliveryApi.DeliveryLinkError('Gone', 410));

    render(<DeliveryPage />);

    await waitFor(() => expect(screen.getByText(/delivery link isn.t available/i)).toBeInTheDocument());
  });

  it('renders the read-only confirmation directly when the order was already submitted', async () => {
    setHash('#order-1.sig');
    vi.mocked(deliveryApi.getDeliveryOrder).mockResolvedValue(submittedOrder);

    render(<DeliveryPage />);

    expect(await screen.findByText('Delivered')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deliver' })).not.toBeInTheDocument(); // not the selector
  });

  it('walks the full handed-to-a-person flow through to submission', async () => {
    setHash('#order-1.sig');
    vi.mocked(deliveryApi.getDeliveryOrder).mockResolvedValue(pendingOrder);
    vi.mocked(deliveryApi.submitDeliveryOutcome).mockResolvedValue(submittedOrder);

    render(<DeliveryPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Deliver' }));
    await userEvent.click(screen.getByRole('radio', { name: /handed to a person/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(screen.getByLabelText('Recipient name'), 'Alex Morgan');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add signature stroke' }));
    await userEvent.click(screen.getByRole('button', { name: 'Accept delivery' }));

    await waitFor(() =>
      expect(deliveryApi.submitDeliveryOutcome).toHaveBeenCalledWith(
        'order-1.sig',
        expect.objectContaining({
          outcome: 'DELIVERED',
          dropMethod: 'HANDED_TO_PERSON',
          recipientName: 'Alex Morgan',
          signature: expect.objectContaining({ format: 'signature_pad' }),
          capturedAt: expect.any(String),
        }),
      ),
    );
    expect(await screen.findByText(/Driver: Alex Turner/)).toBeInTheDocument();
  });

  it('surfaces a submission conflict without losing the review state', async () => {
    setHash('#order-1.sig');
    vi.mocked(deliveryApi.getDeliveryOrder).mockResolvedValue(pendingOrder);
    vi.mocked(deliveryApi.submitDeliveryOutcome).mockRejectedValue(
      new deliveryApi.DeliveryLinkError('This delivery has already been recorded', 409),
    );

    render(<DeliveryPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Unable to deliver' }));
    await userEvent.selectOptions(screen.getByLabelText('Reason'), 'CUSTOMER_REFUSED');
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This delivery has already been recorded');
  });
});
