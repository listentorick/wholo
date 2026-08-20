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
// flow.
vi.mock('@/components/delivery-runs/WorkloadStrip', () => ({
  WorkloadStrip: () => null,
}));

const mockGetDay = vi.fn();
const mockAssignOrderToRun = vi.fn();
const mockUnassignOrderFromRun = vi.fn();

vi.mock('@wholo/admin-api-client', async (importActual) => {
  const actual = await importActual<typeof import('@wholo/admin-api-client')>();
  return {
    ...actual,
    adminDeliveryRunsApi: {
      listDays: vi.fn().mockResolvedValue({ data: [] }),
      getDay: (...args: unknown[]) => mockGetDay(...args),
      assignOrderToRun: (...args: unknown[]) => mockAssignOrderToRun(...args),
      unassignOrderFromRun: (...args: unknown[]) => mockUnassignOrderFromRun(...args),
      reorderRunOrders: vi.fn(),
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

  it('on any other error, shows a generic banner without refetching', async () => {
    mockAssignOrderToRun.mockRejectedValue(new Error('network down'));

    render(<DeliveryRunsPage />);
    await screen.findByTestId('board-view');

    await moveOrder1IntoYorkshire();

    await waitFor(() => expect(screen.getByText('Could not move the delivery. Please try again.')).toBeInTheDocument());
    expect(mockGetDay).toHaveBeenCalledTimes(1);
  });
});
