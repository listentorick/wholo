import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateRunDialog } from './CreateRunDialog';

const mockListRoutes = vi.fn();

vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return {
    ...actual,
    adminDeliveryRoutesApi: {
      ...actual.adminDeliveryRoutesApi,
      list: (...args: unknown[]) => mockListRoutes(...args),
    },
  };
});

const route = (over: Record<string, unknown> = {}) => ({
  id: 'route-1',
  distributorId: 'dist-1',
  name: 'Yorkshire',
  code: null,
  defaultDriverName: null,
  active: true,
  customerCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const DEFAULT_PROPS = {
  existingRouteIds: [] as string[],
  selectedDate: '2026-08-25',
  submitting: false,
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListRoutes.mockResolvedValue({ data: [route(), route({ id: 'route-2', name: 'Coast Road' })] });
});

describe('CreateRunDialog', () => {
  it('lists one option per active route, excluding routes already on the board', async () => {
    render(<CreateRunDialog {...DEFAULT_PROPS} existingRouteIds={['route-1']} />);

    expect(await screen.findByRole('option', { name: /Coast Road/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Yorkshire' })).not.toBeInTheDocument();
    expect(mockListRoutes).toHaveBeenCalledWith({ active: true, limit: 100 });
  });

  it('keeps "Add run" disabled until a route is chosen, then calls onConfirm with the route id', async () => {
    const onConfirm = vi.fn();
    render(<CreateRunDialog {...DEFAULT_PROPS} onConfirm={onConfirm} />);

    await screen.findByRole('option', { name: 'Yorkshire' });
    expect(screen.getByRole('button', { name: 'Add run' })).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText('Route'), 'route-2');
    await userEvent.click(screen.getByRole('button', { name: 'Add run' }));

    expect(onConfirm).toHaveBeenCalledWith('route-2');
  });

  it('shows a dead-end message and a routes link when every active route already has a run', async () => {
    render(<CreateRunDialog {...DEFAULT_PROPS} existingRouteIds={['route-1', 'route-2']} />);

    expect(await screen.findByText(/Every active route already has a run/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage routes' })).toHaveAttribute('href', '/delivery-routes');
    expect(screen.getByRole('button', { name: 'Add run' })).toBeDisabled();
  });

  it('tells the user to create a route (not "every route already has a run") when there are no active routes', async () => {
    mockListRoutes.mockResolvedValue({ data: [] });
    render(<CreateRunDialog {...DEFAULT_PROPS} />);

    expect(await screen.findByText(/don.t have any active delivery routes yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/Every active route already has a run/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a route' })).toHaveAttribute('href', '/delivery-routes/new');
    expect(screen.getByRole('button', { name: 'Add run' })).toBeDisabled();
  });

  it('shows a load-error message and disables the primary button when routes fail to load', async () => {
    mockListRoutes.mockRejectedValue(new Error('boom'));
    render(<CreateRunDialog {...DEFAULT_PROPS} />);

    expect(await screen.findByText(/Could not load routes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add run' })).toBeDisabled();
  });

  it('shows a submitting state with both buttons disabled', async () => {
    render(<CreateRunDialog {...DEFAULT_PROPS} submitting />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
