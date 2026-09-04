import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeliveryRouteForm } from './DeliveryRouteForm';
import type { DeliveryRoute } from '@wholo/types';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const { create, update, deleteRoute } = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
  deleteRoute: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@wholo/admin-api-client', async () => {
  const actual = await vi.importActual<typeof import('@wholo/admin-api-client')>('@wholo/admin-api-client');
  return {
    ...actual,
    adminDeliveryRoutesApi: {
      create,
      update,
      delete: deleteRoute,
    },
  };
});

function makeRoute(overrides: Partial<DeliveryRoute> = {}): DeliveryRoute {
  return {
    id: 'route-1',
    distributorId: 'dist-1',
    name: 'Yorkshire',
    code: 'YKS',
    defaultDriverName: 'Dave Walsh',
    active: true,
    customers: [],
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  update.mockResolvedValue(undefined);
  deleteRoute.mockResolvedValue(undefined);
});

describe('DeliveryRouteForm', () => {
  it('renders initial values in edit mode', () => {
    render(<DeliveryRouteForm route={makeRoute()} />);

    expect(screen.getByDisplayValue('Yorkshire')).toBeInTheDocument();
    expect(screen.getByDisplayValue('YKS')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Dave Walsh')).toBeInTheDocument();
  });

  it('does not show the customer assignment panel for a new route', () => {
    render(<DeliveryRouteForm />);
    expect(screen.queryByText('Customer assignment')).not.toBeInTheDocument();
  });

  it('shows the customer assignment panel once a route exists', () => {
    render(<DeliveryRouteForm route={makeRoute()} />);
    expect(screen.getByText('Customer assignment')).toBeInTheDocument();
  });

  it('creates a route and navigates to its edit page', async () => {
    create.mockResolvedValue(makeRoute({ id: 'route-new' }));
    render(<DeliveryRouteForm />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'North Leeds' } });
    fireEvent.click(screen.getByRole('button', { name: /create route/i }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'North Leeds' }));
    });
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/delivery-routes/route-new/edit');
    });
  });

  it('updates an existing route and shows a Saved confirmation', async () => {
    render(<DeliveryRouteForm route={makeRoute()} />);

    fireEvent.change(screen.getByDisplayValue('Yorkshire'), { target: { value: 'Yorkshire (renamed)' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith('route-1',
        expect.objectContaining({ name: 'Yorkshire (renamed)' }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });

  it('shows an error banner when saving fails', async () => {
    update.mockRejectedValue(new Error('network error'));
    render(<DeliveryRouteForm route={makeRoute()} />);

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to save/i)).toBeInTheDocument();
    });
  });

  it('disables the primary action when the name is blank', () => {
    render(<DeliveryRouteForm route={makeRoute({ name: '' })} />);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });
});
