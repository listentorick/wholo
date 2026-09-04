import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DistributorProvider, useDistributor, connectCtaKind } from './distributor-context';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('./auth-context', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@wholo/api-client', () => ({
  catalogueApi: { getDistributor: vi.fn() },
  portalApi: {
    getDistributorRelationship: vi.fn(),
    requestDistributorAccess: vi.fn(),
  },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { useAuth } from './auth-context';
import { catalogueApi, portalApi } from '@wholo/api-client';

// ── Test harness ──────────────────────────────────────────────────────────────

function TestHarness() {
  const { distributor, relationshipStatus, relationshipMinSpend, effectiveMinSpend, requestAccess } =
    useDistributor();
  return (
    <div>
      <span data-testid="distributor-name">{distributor?.name ?? ''}</span>
      <span data-testid="status">{relationshipStatus ?? 'loading'}</span>
      <span data-testid="min-spend">{relationshipMinSpend ?? ''}</span>
      <span data-testid="effective-min-spend">{effectiveMinSpend ?? ''}</span>
      <button onClick={() => requestAccess(true).catch(() => {})}>request-yes</button>
      <button onClick={() => requestAccess(false).catch(() => {})}>request-no</button>
    </div>
  );
}

function renderDistributor(initialDistributor?: any) {
  return render(
    <DistributorProvider distributorSlug="test-dist" initialDistributor={initialDistributor}>
      <TestHarness />
    </DistributorProvider>,
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(catalogueApi.getDistributor).mockResolvedValue({ id: 'dist-1', name: 'Test Dist' } as any);
  vi.mocked(useAuth).mockReturnValue({
    user: { organisationId: 'cust-1' },
    accessToken: 'test-token',
    orderAsMode: false,
    orderAsCustomerId: null,
  } as any);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DistributorProvider — relationship fetch', () => {
  it('fetches the relationship for the signed-in customer and exposes its status', async () => {
    vi.mocked(portalApi.getDistributorRelationship).mockResolvedValue({
      status: 'ACTIVE',
      minimumOrderSpend: '150.00',
    } as any);

    renderDistributor();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ACTIVE'));
    expect(portalApi.getDistributorRelationship).toHaveBeenCalledWith('test-dist', 'cust-1');
    expect(screen.getByTestId('min-spend').textContent).toBe('150');
  });

  it('exposes NONE when there is no relationship', async () => {
    vi.mocked(portalApi.getDistributorRelationship).mockResolvedValue(null);
    renderDistributor();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('NONE'));
  });

  it('does not expose a min spend for a non-ACTIVE relationship', async () => {
    vi.mocked(portalApi.getDistributorRelationship).mockResolvedValue({
      status: 'PENDING_REQUEST',
      minimumOrderSpend: '150.00',
    } as any);
    renderDistributor();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('PENDING_REQUEST'));
    expect(screen.getByTestId('min-spend').textContent).toBe('');
  });

  it('exposes NONE immediately without fetching when signed out', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      orderAsMode: false,
      orderAsCustomerId: null,
    } as any);
    renderDistributor();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('NONE'));
    expect(portalApi.getDistributorRelationship).not.toHaveBeenCalled();
  });

  it('uses the order-as customer id over the signed-in user\'s own organisation id', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { organisationId: 'admin-org' },
      accessToken: 'test-token',
      orderAsMode: true,
      orderAsCustomerId: 'impersonated-cust',
    } as any);
    vi.mocked(portalApi.getDistributorRelationship).mockResolvedValue({ status: 'ACTIVE', minimumOrderSpend: null } as any);

    renderDistributor();

    await waitFor(() =>
      expect(portalApi.getDistributorRelationship).toHaveBeenCalledWith('test-dist', 'impersonated-cust'),
    );
  });
});

describe('DistributorProvider — effectiveMinSpend', () => {
  it('falls back to the distributor default minimum when the active relationship has no override', async () => {
    vi.mocked(catalogueApi.getDistributor).mockResolvedValue({
      id: 'dist-1',
      name: 'Test Dist',
      minimumOrderSpend: 200,
    } as any);
    vi.mocked(portalApi.getDistributorRelationship).mockResolvedValue({
      status: 'ACTIVE',
      minimumOrderSpend: null,
    } as any);

    renderDistributor();

    await waitFor(() => expect(screen.getByTestId('effective-min-spend').textContent).toBe('200'));
  });

  it('uses the relationship override over the distributor default when both are set', async () => {
    vi.mocked(catalogueApi.getDistributor).mockResolvedValue({
      id: 'dist-1',
      name: 'Test Dist',
      minimumOrderSpend: 200,
    } as any);
    vi.mocked(portalApi.getDistributorRelationship).mockResolvedValue({
      status: 'ACTIVE',
      minimumOrderSpend: '50.00',
    } as any);

    renderDistributor();

    await waitFor(() => expect(screen.getByTestId('effective-min-spend').textContent).toBe('50'));
  });

  it('shows the distributor default even when there is no active relationship (e.g. PENDING), for prospective customers', async () => {
    vi.mocked(catalogueApi.getDistributor).mockResolvedValue({
      id: 'dist-1',
      name: 'Test Dist',
      minimumOrderSpend: 200,
    } as any);
    vi.mocked(portalApi.getDistributorRelationship).mockResolvedValue({
      status: 'PENDING_REQUEST',
      minimumOrderSpend: '50.00',
    } as any);

    renderDistributor();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('PENDING_REQUEST'));
    expect(screen.getByTestId('effective-min-spend').textContent).toBe('200');
  });

  it('shows nothing while relationship status is still loading (null)', async () => {
    vi.mocked(portalApi.getDistributorRelationship).mockImplementation(() => new Promise(() => {}));

    renderDistributor();

    expect(screen.getByTestId('status').textContent).toBe('loading');
    expect(screen.getByTestId('effective-min-spend').textContent).toBe('');
  });

  it('is null when neither the relationship nor the distributor has a minimum set', async () => {
    vi.mocked(portalApi.getDistributorRelationship).mockResolvedValue({
      status: 'ACTIVE',
      minimumOrderSpend: null,
    } as any);

    renderDistributor();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ACTIVE'));
    expect(screen.getByTestId('effective-min-spend').textContent).toBe('');
  });
});

describe('DistributorProvider — requestAccess', () => {
  it('sends the answer then refetches the relationship', async () => {
    vi.mocked(portalApi.getDistributorRelationship)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: 'PENDING_REQUEST', minimumOrderSpend: null } as any);
    vi.mocked(portalApi.requestDistributorAccess).mockResolvedValue({ status: 'PENDING_REQUEST' } as any);

    renderDistributor();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('NONE'));

    fireEvent.click(screen.getByText('request-yes'));

    await waitFor(() =>
      expect(portalApi.requestDistributorAccess).toHaveBeenCalledWith('test-dist', 'cust-1', true),
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('PENDING_REQUEST'));
  });

  it('sends false for the "no" answer', async () => {
    vi.mocked(portalApi.getDistributorRelationship).mockResolvedValue(null);
    vi.mocked(portalApi.requestDistributorAccess).mockResolvedValue({ status: 'PENDING_REQUEST' } as any);

    renderDistributor();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('NONE'));

    fireEvent.click(screen.getByText('request-no'));

    await waitFor(() =>
      expect(portalApi.requestDistributorAccess).toHaveBeenCalledWith('test-dist', 'cust-1', false),
    );
  });
});

describe('DistributorProvider — initialDistributor', () => {
  it('seeds distributor state synchronously, before the background fetch resolves', () => {
    vi.mocked(catalogueApi.getDistributor).mockImplementation(() => new Promise(() => {}));

    renderDistributor({ id: 'dist-1', name: 'Seeded Dist' });

    expect(screen.getByTestId('distributor-name').textContent).toBe('Seeded Dist');
  });

  it('is null when no initialDistributor is given, until the fetch resolves', async () => {
    vi.mocked(catalogueApi.getDistributor).mockResolvedValue({ id: 'dist-1', name: 'Fetched Dist' } as any);

    renderDistributor();

    expect(screen.getByTestId('distributor-name').textContent).toBe('');
    await waitFor(() => expect(screen.getByTestId('distributor-name').textContent).toBe('Fetched Dist'));
  });
});

describe('connectCtaKind', () => {
  it('offers to connect when there is no relationship', () => {
    expect(connectCtaKind('NONE')).toBe('connect');
  });

  it('offers to connect (re-request) when the relationship is INACTIVE', () => {
    expect(connectCtaKind('INACTIVE' as any)).toBe('connect');
  });

  it.each(['PENDING_INVITE', 'PENDING_REQUEST'])('shows pending for %s', (status) => {
    expect(connectCtaKind(status as any)).toBe('pending');
  });

  it('shows suspended for SUSPENDED, with no re-request offered', () => {
    expect(connectCtaKind('SUSPENDED' as any)).toBe('suspended');
  });

  it('shows nothing for ACTIVE', () => {
    expect(connectCtaKind('ACTIVE' as any)).toBeNull();
  });

  it('shows nothing while still loading (null)', () => {
    expect(connectCtaKind(null)).toBeNull();
  });
});
