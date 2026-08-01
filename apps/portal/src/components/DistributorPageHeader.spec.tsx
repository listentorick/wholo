import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DistributorPageHeader } from './DistributorPageHeader';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/distributor-context', async () => {
  const actual = await vi.importActual<typeof import('@/lib/distributor-context')>('@/lib/distributor-context');
  return {
    ...actual,
    useDistributor: vi.fn(),
  };
});

vi.mock('@/lib/auth-context', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@wholo/api-client', () => ({
  deliveryApi: { getAvailableDates: vi.fn() },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { useDistributor } from '@/lib/distributor-context';
import { useAuth } from '@/lib/auth-context';
import { deliveryApi } from '@wholo/api-client';

// ── Setup ─────────────────────────────────────────────────────────────────────

const slug = 'fine-wines-co';
const requestAccess = vi.fn().mockResolvedValue(undefined);

function mockDistributorReturn(overrides: Record<string, unknown> = {}) {
  vi.mocked(useDistributor).mockReturnValue({
    distributor: { name: 'Fine Wines Co', logoUrl: 'https://example.com/logo.png', minimumOrderSpend: null } as any,
    relationshipStatus: 'NONE',
    relationshipMinSpend: null,
    bannerScrolledPast: false,
    setBannerScrolledPast: vi.fn(),
    requestAccess,
    refetchRelationship: vi.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requestAccess.mockClear().mockResolvedValue(undefined);
  mockDistributorReturn();
  vi.mocked(useAuth).mockReturnValue({ accessToken: 'test-token' } as any);
  vi.mocked(deliveryApi.getAvailableDates).mockResolvedValue({ dates: [], profileId: null });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DistributorPageHeader', () => {
  it('does not render distributor name or logo (shown in the header above the tabs instead)', () => {
    const { container } = render(<DistributorPageHeader distributorSlug={slug} />);
    expect(screen.queryByText('Fine Wines Co')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows delivery line when dates are returned', async () => {
    vi.mocked(deliveryApi.getAvailableDates).mockResolvedValue({
      dates: [{ date: '2026-07-07', cutoffDeadline: '2026-07-06T11:50:00.000Z' }],
      profileId: 'profile-1',
    });
    render(<DistributorPageHeader distributorSlug={slug} />);
    await waitFor(() => {
      expect(screen.getByText(/Order by/)).toBeTruthy();
    });
  });

  it('bolds the cutoff time in the delivery line', async () => {
    vi.mocked(deliveryApi.getAvailableDates).mockResolvedValue({
      dates: [{ date: '2026-07-07', cutoffDeadline: '2026-07-06T11:50:00.000Z' }],
      profileId: 'profile-1',
    });
    const { container } = render(<DistributorPageHeader distributorSlug={slug} />);
    await waitFor(() => expect(screen.getByText(/Order by/)).toBeTruthy());
    const strongs = container.querySelectorAll('strong');
    expect(strongs.length).toBeGreaterThanOrEqual(2);
  });

  it('hides delivery line when dates array is empty', async () => {
    vi.mocked(deliveryApi.getAvailableDates).mockResolvedValue({ dates: [], profileId: null });
    render(<DistributorPageHeader distributorSlug={slug} />);
    await waitFor(() => expect(deliveryApi.getAvailableDates).toHaveBeenCalled());
    expect(screen.queryByText(/Order by/)).toBeNull();
  });

  it('hides delivery line when API call fails', async () => {
    vi.mocked(deliveryApi.getAvailableDates).mockRejectedValue(new Error('Network error'));
    render(<DistributorPageHeader distributorSlug={slug} />);
    await waitFor(() => expect(deliveryApi.getAvailableDates).toHaveBeenCalled());
    expect(screen.queryByText(/Order by/)).toBeNull();
  });

  it('shows Add this supplier button when no relationship', () => {
    render(<DistributorPageHeader distributorSlug={slug} />);
    expect(screen.getByRole('button', { name: 'Add this supplier' })).toBeTruthy();
  });

  it('hides Add this supplier button when relationship is active', () => {
    mockDistributorReturn({ relationshipStatus: 'ACTIVE' });
    render(<DistributorPageHeader distributorSlug={slug} />);
    expect(screen.queryByRole('button', { name: 'Add this supplier' })).toBeNull();
  });

  it('shows a locked Pending badge, not the CTA, when a request is pending', () => {
    mockDistributorReturn({ relationshipStatus: 'PENDING_INVITE' });
    render(<DistributorPageHeader distributorSlug={slug} />);
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add this supplier' })).toBeNull();
  });

  it('shows a locked Suspended message, not the CTA, when suspended', () => {
    mockDistributorReturn({ relationshipStatus: 'SUSPENDED' });
    render(<DistributorPageHeader distributorSlug={slug} />);
    expect(screen.getByText('Suspended')).toBeTruthy();
    expect(screen.getByText('Suspended — contact this wholesaler')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add this supplier' })).toBeNull();
  });

  it('opens the confirmation modal and requests access with the chosen answer', async () => {
    render(<DistributorPageHeader distributorSlug={slug} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add this supplier' }));
    expect(
      screen.getByText('Have you spoken with or ordered from Fine Wines Co in the last 90 days?'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /No, this is a first introduction/ }));
    await waitFor(() => expect(requestAccess).toHaveBeenCalledWith(false));
  });

  it('does not call delivery API when no access token', () => {
    vi.mocked(useAuth).mockReturnValue({ accessToken: null } as any);
    render(<DistributorPageHeader distributorSlug={slug} />);
    expect(deliveryApi.getAvailableDates).not.toHaveBeenCalled();
  });

  it('shows minimum order spend when active relationship has one set', () => {
    mockDistributorReturn({ relationshipStatus: 'ACTIVE', relationshipMinSpend: 150 });
    render(<DistributorPageHeader distributorSlug={slug} />);
    expect(screen.getByText(/minimum order value/)).toBeTruthy();
    expect(screen.getByText(/150\.00/)).toBeTruthy();
  });

  it('shows distributor default minimum spend when no active relationship', () => {
    mockDistributorReturn({
      distributor: { name: 'Fine Wines Co', logoUrl: null, minimumOrderSpend: 200 } as any,
      relationshipStatus: 'NONE',
    });
    render(<DistributorPageHeader distributorSlug={slug} />);
    expect(screen.getByText(/200\.00 minimum order value/)).toBeTruthy();
  });

  it('hides minimum order spend when none is set', () => {
    mockDistributorReturn({ relationshipStatus: 'ACTIVE' });
    render(<DistributorPageHeader distributorSlug={slug} />);
    expect(screen.queryByText(/minimum order value/)).toBeNull();
  });
});
