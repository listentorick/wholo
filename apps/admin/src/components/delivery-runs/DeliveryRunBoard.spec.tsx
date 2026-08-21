import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DeliveryDayBoard } from '@wholo/types';
import { DeliveryRunBoard } from './DeliveryRunBoard';

// DriverManifestButton is always rendered (locked/unlocked) inside each run
// column's header and reads useAuth() on every render.
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'token-1' }),
}));

function makeBoard(overrides: Partial<DeliveryDayBoard> = {}): DeliveryDayBoard {
  return {
    distributorId: 'dist-1',
    date: '2026-08-20',
    runs: [],
    unassigned: [],
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

describe('DeliveryRunBoard', () => {
  it('always renders the Unassigned column, even with zero runs', () => {
    render(<DeliveryRunBoard board={makeBoard()} {...NOOP} />);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('renders one column per run', () => {
    render(<DeliveryRunBoard
      board={makeBoard({
        runs: [
          { runId: 'r1', routeId: 'route-1', name: 'Yorkshire', driverName: null, status: 'OPEN', version: 0, cards: [], stopCount: 0, itemCount: 0 },
          { runId: 'r2', routeId: 'route-2', name: 'Lancashire', driverName: null, status: 'OPEN', version: 0, cards: [], stopCount: 0, itemCount: 0 },
        ],
      })}
      {...NOOP}
    />);
    expect(screen.getByText('Yorkshire')).toBeInTheDocument();
    expect(screen.getByText('Lancashire')).toBeInTheDocument();
  });
});
