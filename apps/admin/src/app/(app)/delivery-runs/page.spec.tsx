import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DeliveryDayBoard } from '@wholo/types';
import DeliveryRunsPage from './page';

vi.mock('@/lib/hooks/use-require-auth', () => ({
  useRequireAuth: () => ({ isLoading: false }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

vi.mock('@/components/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// WorkloadStrip makes its own listDays call and is covered by its own
// spec — stub it out so this test is only exercising the board mutation
// flow. Captures the refreshKey prop it's given so the change-delivery-date
// flow can assert the strip is actually told to re-fetch after a cross-day
// move, without re-testing WorkloadStrip's own fetch behaviour here.
const mockWorkloadStripProps = vi.fn();
vi.mock('@/components/delivery-runs/WorkloadStrip', () => ({
  WorkloadStrip: (props: { refreshKey?: number }) => {
    mockWorkloadStripProps(props);
    return null;
  },
}));

const mockGetDay = vi.fn();
const mockCreateRun = vi.fn();
const mockAssignOrderToRun = vi.fn();
const mockUnassignOrderFromRun = vi.fn();
const mockUpdateRun = vi.fn();
const mockChangeScheduledDeliveryDate = vi.fn();
const mockGetReschedulePreview = vi.fn();
const mockListRoutes = vi.fn();

vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return {
    ...actual,
    adminDeliveryRunsApi: {
      listDays: vi.fn().mockResolvedValue({ data: [] }),
      getDay: (...args: unknown[]) => mockGetDay(...args),
      createRun: (...args: unknown[]) => mockCreateRun(...args),
      assignOrderToRun: (...args: unknown[]) => mockAssignOrderToRun(...args),
      unassignOrderFromRun: (...args: unknown[]) => mockUnassignOrderFromRun(...args),
      reorderRunOrders: vi.fn(),
      updateRun: (...args: unknown[]) => mockUpdateRun(...args),
      changeScheduledDeliveryDate: (...args: unknown[]) => mockChangeScheduledDeliveryDate(...args),
      getReschedulePreview: (...args: unknown[]) => mockGetReschedulePreview(...args),
    },
    // CreateRunDialog lists active routes for its picker.
    adminDeliveryRoutesApi: {
      list: (...args: unknown[]) => mockListRoutes(...args),
    },
    // UndatedDeliveriesPanel also mounts on this page and calls this on its
    // own — stubbed so it never hits a real fetch during these tests.
    adminOrdersApi: {
      listOrders: vi.fn().mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false, total: 0 } }),
    },
  };
});

function makeBoard(overrides: Partial<DeliveryDayBoard> = {}): DeliveryDayBoard {
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
        stopCount: 0,
        itemCount: 0,
        cards: [],
      },
    ],
    unassigned: [
      {
        orderId: 'order-1',
        orderNumber: 'ORD-1001',
        traderCustomerId: 'cust-1',
        customerName: 'Blackbird Kitchen',
        deliveryAddress: null,
        stopNumber: null,
        lineCount: 1,
        itemCount: 5,
        attention: 'UNASSIGNED',
        unallocatedReason: null,
        suggestedRunId: 'run-1',
        suggestedRouteName: 'Yorkshire',
        scheduledDeliveryDate: '2026-08-20',
        requestedDeliveryDate: '2026-08-20',
        allocationSource: null,
      },
    ],
    ...overrides,
  };
}

// Board view and List view both exist in the DOM at once (List stays
// mounted, CSS-hidden, so it's forced visible below md) — same dual-surface
// convention as MobileCardList's own table+list pairing. Scope to
// board-view so these mutation-flow assertions aren't tripped up by the
// duplicated content, same approach AccountingContactsTable.spec.tsx uses.
async function moveOrder1IntoYorkshire() {
  const boardView = within(await screen.findByTestId('board-view'));
  await userEvent.click(boardView.getByRole('button', { name: 'Move to…' }));
  // The menuitem's accessible name also picks up the adjacent "Suggested"
  // label text (this fixture's card has suggestedRunId set), so match on
  // substring rather than the exact run name. MoveToMenu portals to
  // document.body, so it's outside board-view's subtree.
  await userEvent.click(screen.getByRole('menuitem', { name: /Yorkshire/ }));
}

describe('DeliveryRunsPage — mutation flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDay.mockResolvedValue(makeBoard());
  });

  it('moves the card immediately, without waiting for the network response', async () => {
    let resolveAssign: (board: DeliveryDayBoard) => void;
    mockAssignOrderToRun.mockReturnValue(new Promise((resolve) => { resolveAssign = resolve; }));

    render(<DeliveryRunsPage />);
    await screen.findByTestId('board-view');

    await moveOrder1IntoYorkshire();

    // Still awaiting the network response, but the optimistic update should
    // already have moved the card out of Unassigned — no snap-back-then-
    // disappear flicker while the request is in flight.
    const boardView = within(screen.getByTestId('board-view'));
    expect(boardView.getByText('Everything’s assigned')).toBeInTheDocument();

    resolveAssign!(makeBoard({ unassigned: [] }));
    await waitFor(() => expect(screen.queryByText('Blackbird Kitchen')).not.toBeInTheDocument());
  });

  it('on success, swaps in the returned board with no extra fetch', async () => {
    const refreshedBoard = makeBoard({ unassigned: [] });
    mockAssignOrderToRun.mockResolvedValue(refreshedBoard);

    render(<DeliveryRunsPage />);
    await screen.findByTestId('board-view');

    await moveOrder1IntoYorkshire();

    await waitFor(() => expect(screen.queryByText('Blackbird Kitchen')).not.toBeInTheDocument());
    expect(mockGetDay).toHaveBeenCalledTimes(1);
  });

  it('on 409, shows a banner and refetches — never auto-retries the mutation', async () => {
    const { ApiError } = await import('@wholo/admin-api-client');
    mockAssignOrderToRun.mockRejectedValue(new ApiError({ type: 'about:blank', title: 'Conflict', status: 409, detail: 'stale' }, 409));

    render(<DeliveryRunsPage />);
    await screen.findByTestId('board-view');

    await moveOrder1IntoYorkshire();

    await waitFor(() => expect(screen.getByText('This board changed elsewhere — refreshed.')).toBeInTheDocument());
    expect(mockGetDay).toHaveBeenCalledTimes(2);
    expect(mockAssignOrderToRun).toHaveBeenCalledTimes(1);
  });

  it('on 422, shows the server-provided detail and refetches', async () => {
    const { ApiError } = await import('@wholo/admin-api-client');
    mockAssignOrderToRun.mockRejectedValue(
      new ApiError({ type: 'about:blank', title: 'Unprocessable', status: 422, detail: 'Cannot assign into a run that is already marked ready' }, 422),
    );

    render(<DeliveryRunsPage />);
    await screen.findByTestId('board-view');

    await moveOrder1IntoYorkshire();

    await waitFor(() => expect(screen.getByText('Cannot assign into a run that is already marked ready')).toBeInTheDocument());
    expect(mockGetDay).toHaveBeenCalledTimes(2);
  });

  it('on any other error, shows a generic banner, rolls back the optimistic move, and does not refetch', async () => {
    mockAssignOrderToRun.mockRejectedValue(new Error('network down'));

    render(<DeliveryRunsPage />);
    await screen.findByTestId('board-view');

    await moveOrder1IntoYorkshire();

    await waitFor(() => expect(screen.getByText('Could not move the delivery. Please try again.')).toBeInTheDocument());
    expect(mockGetDay).toHaveBeenCalledTimes(1);

    const boardView = within(screen.getByTestId('board-view'));
    expect(boardView.getByText('Blackbird Kitchen')).toBeInTheDocument();
    expect(boardView.getByText('No deliveries yet')).toBeInTheDocument();
  });
});

async function markYorkshireReady() {
  const boardView = within(await screen.findByTestId('board-view'));
  await userEvent.click(boardView.getByRole('button', { name: 'Mark ready' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark ready' }));
}

describe('DeliveryRunsPage — run update flow (mark ready / reopen / driver)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDay.mockResolvedValue(makeBoard());
  });

  it('marks the run ready immediately (optimistic), then swaps in the returned board', async () => {
    let resolveUpdate: (board: DeliveryDayBoard) => void;
    mockUpdateRun.mockReturnValue(new Promise((resolve) => { resolveUpdate = resolve; }));

    render(<DeliveryRunsPage />);
    await markYorkshireReady();

    const boardView = within(screen.getByTestId('board-view'));
    expect(boardView.getByText('Ready')).toBeInTheDocument();

    resolveUpdate!(makeBoard({
      runs: [{
        runId: 'run-1', routeId: 'route-1', name: 'Yorkshire', driverName: null, status: 'READY', version: 1, stopCount: 0, itemCount: 0, cards: [],
      }],
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(boardView.getByText('Ready')).toBeInTheDocument();
  });

  it('calls updateRun with the run\'s current version and status READY', async () => {
    mockUpdateRun.mockResolvedValue(makeBoard());

    render(<DeliveryRunsPage />);
    await markYorkshireReady();

    expect(mockUpdateRun).toHaveBeenCalledWith('run-1', { version: 0, status: 'READY' });
  });

  it('on 409, shows a banner and refetches', async () => {
    const { ApiError } = await import('@wholo/admin-api-client');
    mockUpdateRun.mockRejectedValue(new ApiError({ type: 'about:blank', title: 'Conflict', status: 409, detail: 'stale' }, 409));

    render(<DeliveryRunsPage />);
    await markYorkshireReady();

    await waitFor(() => expect(screen.getByText('This board changed elsewhere — refreshed.')).toBeInTheDocument());
    expect(mockGetDay).toHaveBeenCalledTimes(2);
  });

  it('on 422, shows the server-provided detail and refetches', async () => {
    const { ApiError } = await import('@wholo/admin-api-client');
    mockUpdateRun.mockRejectedValue(
      new ApiError({ type: 'about:blank', title: 'Unprocessable', status: 422, detail: 'Run is already marked ready' }, 422),
    );

    render(<DeliveryRunsPage />);
    await markYorkshireReady();

    await waitFor(() => expect(screen.getByText('Run is already marked ready')).toBeInTheDocument());
    expect(mockGetDay).toHaveBeenCalledTimes(2);
  });

  it('on any other error, shows a generic banner and rolls back to OPEN', async () => {
    mockUpdateRun.mockRejectedValue(new Error('network down'));

    render(<DeliveryRunsPage />);
    await markYorkshireReady();

    await waitFor(() => expect(screen.getByText('Could not update the run. Please try again.')).toBeInTheDocument());
    expect(mockGetDay).toHaveBeenCalledTimes(1);

    const boardView = within(screen.getByTestId('board-view'));
    expect(boardView.getByText('Open')).toBeInTheDocument();
  });
});

async function openChangeDateDialog() {
  const boardView = within(await screen.findByTestId('board-view'));
  await userEvent.click(boardView.getByLabelText('Change delivery date'));
}

describe('DeliveryRunsPage — change delivery date flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDay.mockResolvedValue(makeBoard());
    mockGetReschedulePreview.mockResolvedValue({
      resolution: { allocated: false, reason: 'NO_ROUTE' },
      nearbyDeliveries: [],
    });
  });

  it('calls changeScheduledDeliveryDate with the new and expected dates, then closes the dialog and refetches', async () => {
    mockChangeScheduledDeliveryDate.mockResolvedValue({});

    render(<DeliveryRunsPage />);
    await openChangeDateDialog();

    const input = screen.getByLabelText('New delivery date');
    await userEvent.clear(input);
    await userEvent.type(input, '2026-08-25');
    await waitFor(() => expect(screen.getByText('Save date')).not.toBeDisabled());
    await userEvent.click(screen.getByText('Save date'));

    await waitFor(() => expect(mockChangeScheduledDeliveryDate).toHaveBeenCalledWith('order-1',
      { scheduledDeliveryDate: '2026-08-25', expectedScheduledDeliveryDate: '2026-08-20' },
    ));
    await waitFor(() => expect(screen.queryByText('Change delivery date')).not.toBeInTheDocument());
    expect(mockGetDay).toHaveBeenCalledTimes(2); // initial load + refetch after confirm

    // WorkloadStrip must be told to re-fetch too — a reschedule can move a
    // stop's count from this day to a different one on the strip.
    const refreshKeys = mockWorkloadStripProps.mock.calls.map(([props]) => props.refreshKey);
    expect(refreshKeys.at(-1)).toBe(refreshKeys[0] + 1);
  });

  it('on 409, shows a banner, refetches, and closes the dialog', async () => {
    const { ApiError } = await import('@wholo/admin-api-client');
    mockChangeScheduledDeliveryDate.mockRejectedValue(
      new ApiError({ type: 'about:blank', title: 'Conflict', status: 409, detail: 'stale' }, 409),
    );

    render(<DeliveryRunsPage />);
    await openChangeDateDialog();
    const input = screen.getByLabelText('New delivery date');
    await userEvent.clear(input);
    await userEvent.type(input, '2026-08-25');
    await waitFor(() => expect(screen.getByText('Save date')).not.toBeDisabled());
    await userEvent.click(screen.getByText('Save date'));

    await waitFor(() => expect(screen.getByText('This board changed elsewhere — refreshed.')).toBeInTheDocument());
    expect(mockGetDay).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Change delivery date')).not.toBeInTheDocument();
  });

  it('on 422, shows the server-provided detail and refetches', async () => {
    const { ApiError } = await import('@wholo/admin-api-client');
    mockChangeScheduledDeliveryDate.mockRejectedValue(
      new ApiError({
        type: 'about:blank', title: 'Unprocessable', status: 422, detail: 'Cannot reschedule into a run that is already marked ready',
      }, 422),
    );

    render(<DeliveryRunsPage />);
    await openChangeDateDialog();
    const input = screen.getByLabelText('New delivery date');
    await userEvent.clear(input);
    await userEvent.type(input, '2026-08-25');
    await waitFor(() => expect(screen.getByText('Save date')).not.toBeDisabled());
    await userEvent.click(screen.getByText('Save date'));

    await waitFor(() => expect(screen.getByText('Cannot reschedule into a run that is already marked ready')).toBeInTheDocument());
    expect(mockGetDay).toHaveBeenCalledTimes(2);
  });

  it('on any other error, shows a generic banner and does not refetch', async () => {
    mockChangeScheduledDeliveryDate.mockRejectedValue(new Error('network down'));

    render(<DeliveryRunsPage />);
    await openChangeDateDialog();
    const input = screen.getByLabelText('New delivery date');
    await userEvent.clear(input);
    await userEvent.type(input, '2026-08-25');
    await waitFor(() => expect(screen.getByText('Save date')).not.toBeDisabled());
    await userEvent.click(screen.getByText('Save date'));

    await waitFor(() => expect(screen.getByText('Could not change the delivery date. Please try again.')).toBeInTheDocument());
    expect(mockGetDay).toHaveBeenCalledTimes(1);
  });
});

const ROUTE_FIXTURE = {
  id: 'route-2',
  distributorId: 'dist-1',
  name: 'Coast Road',
  code: null,
  defaultDriverName: null,
  active: true,
  customerCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('DeliveryRunsPage — create run flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDay.mockResolvedValue(makeBoard());
    mockListRoutes.mockResolvedValue({ data: [ROUTE_FIXTURE] });
  });

  it('offers "Plan a run" from the empty state and opens the dialog', async () => {
    mockGetDay.mockResolvedValue(makeBoard({ runs: [], unassigned: [] }));

    render(<DeliveryRunsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Plan a run' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Plan a run');
  });

  it('keeps showing the board (not the empty state) when a day has only an empty run', async () => {
    mockGetDay.mockResolvedValue(makeBoard({
      runs: [{
        runId: 'run-1', routeId: 'route-1', name: 'Yorkshire', driverName: null, status: 'OPEN', version: 0, stopCount: 0, itemCount: 0, cards: [],
      }],
      unassigned: [],
    }));

    render(<DeliveryRunsPage />);

    expect(await screen.findByTestId('board-view')).toBeInTheDocument();
    expect(screen.queryByText('No deliveries for this day')).not.toBeInTheDocument();
  });

  it('creates a run from the header button: picks a route and calls createRun for the selected day', async () => {
    mockCreateRun.mockResolvedValue(makeBoard());

    render(<DeliveryRunsPage />);
    await screen.findByTestId('board-view');

    await userEvent.click(screen.getAllByRole('button', { name: 'Add run' })[0]);
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.selectOptions(await dialog.findByLabelText('Route'), 'route-2');
    await userEvent.click(dialog.getByRole('button', { name: 'Add run' }));

    await waitFor(() => expect(mockCreateRun).toHaveBeenCalledWith(
      expect.objectContaining({ routeId: 'route-2', deliveryDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    ));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens the same dialog from the board\'s "Add run" column', async () => {
    render(<DeliveryRunsPage />);
    const boardView = within(await screen.findByTestId('board-view'));

    await userEvent.click(boardView.getByRole('button', { name: 'Add run' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Plan a run');
  });

  it('omits routes that already have a run on this day from the picker', async () => {
    mockListRoutes.mockResolvedValue({
      data: [{ ...ROUTE_FIXTURE, id: 'route-1', name: 'Yorkshire' }, ROUTE_FIXTURE],
    });

    render(<DeliveryRunsPage />);
    await screen.findByTestId('board-view');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add run' })[0]);
    const dialog = within(await screen.findByRole('dialog'));

    await dialog.findByRole('option', { name: /Coast Road/ });
    expect(dialog.queryByRole('option', { name: 'Yorkshire' })).not.toBeInTheDocument();
  });

  it('on 422, shows the server detail and closes the dialog', async () => {
    const { ApiError } = await import('@wholo/admin-api-client');
    mockCreateRun.mockRejectedValue(new ApiError({
      type: 'about:blank', title: 'Unprocessable', status: 422, detail: 'A run for this route already exists on this day',
    }, 422));

    render(<DeliveryRunsPage />);
    await screen.findByTestId('board-view');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add run' })[0]);
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.selectOptions(await dialog.findByLabelText('Route'), 'route-2');
    await userEvent.click(dialog.getByRole('button', { name: 'Add run' }));

    await waitFor(() => expect(screen.getByText('A run for this route already exists on this day')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('DeliveryRunsPage — filters visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDay.mockResolvedValue(makeBoard());
  });

  it('hides the filters at md+ while Board is the active view, since Board renders unfiltered there', async () => {
    render(<DeliveryRunsPage />);
    await screen.findByTestId('board-view');

    expect(screen.getByTestId('board-filters').className).toContain('md:hidden');
  });

  it('shows the filters unconditionally once List is the active view', async () => {
    render(<DeliveryRunsPage />);
    await screen.findByTestId('board-view');

    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    await screen.findByTestId('list-view');

    expect(screen.getByTestId('board-filters').className).not.toContain('md:hidden');
  });
});
