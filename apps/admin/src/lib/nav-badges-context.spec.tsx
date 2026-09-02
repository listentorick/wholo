import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { NavBadgesProvider, useNavBadges } from './nav-badges-context';

const countOrders = vi.fn();
const countContacts = vi.fn();
vi.mock('@wholo/admin-api-client', () => ({
  adminOrdersApi: { countOrdersNeedingAttention: (...a: unknown[]) => countOrders(...a) },
  adminAccountingApi: { countContactsNeedingAttention: (...a: unknown[]) => countContacts(...a) },
}));

const authState: { accessToken: string | null } = { accessToken: 'tok-1' };
vi.mock('./auth-context', () => ({ useAuth: () => authState }));

function Probe() {
  const { counts } = useNavBadges();
  return <span data-testid="counts">{JSON.stringify(counts)}</span>;
}

// Let queued microtasks (the two count promises) settle.
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  vi.clearAllMocks();
  authState.accessToken = 'tok-1';
  countOrders.mockResolvedValue({ count: 3 });
  countContacts.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NavBadgesProvider', () => {
  it('fetches both attention counts on mount, keyed by nav href', async () => {
    render(<NavBadgesProvider><Probe /></NavBadgesProvider>);
    await flush();

    expect(countOrders).toHaveBeenCalledWith('tok-1');
    expect(countContacts).toHaveBeenCalledWith('tok-1');
    expect(screen.getByTestId('counts').textContent).toBe(
      JSON.stringify({ '/orders': 3, '/integrations': 1 }),
    );
  });

  it('makes no request when there is no access token', async () => {
    authState.accessToken = null;
    render(<NavBadgesProvider><Probe /></NavBadgesProvider>);
    await flush();

    expect(countOrders).not.toHaveBeenCalled();
    expect(countContacts).not.toHaveBeenCalled();
    expect(screen.getByTestId('counts').textContent).toBe('{}');
  });

  it('polls again on the interval and keeps the last good value when a refresh fails', async () => {
    vi.useFakeTimers();
    render(<NavBadgesProvider><Probe /></NavBadgesProvider>);
    await flush();
    expect(countOrders).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('counts').textContent).toContain('"/orders":3');

    countOrders.mockRejectedValueOnce(new Error('network'));
    countContacts.mockResolvedValueOnce({ count: 4 });
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    await flush();

    expect(countOrders).toHaveBeenCalledTimes(2);
    const counts = JSON.parse(screen.getByTestId('counts').textContent!);
    expect(counts['/orders']).toBe(3); // failed call did not clobber it
    expect(counts['/integrations']).toBe(4); // successful call updated it
  });
});
