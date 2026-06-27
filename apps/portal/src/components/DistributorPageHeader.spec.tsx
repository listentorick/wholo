import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { DistributorPageHeader, formatDeliveryParts } from './DistributorPageHeader';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/distributor-context', () => ({
  useDistributor: vi.fn(),
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useDistributor).mockReturnValue({
    distributor: { name: 'Fine Wines Co', logoUrl: 'https://example.com/logo.png', minimumOrderSpend: null } as any,
    hasRelationship: false,
    relationshipMinSpend: null,
    bannerScrolledPast: false,
    setBannerScrolledPast: vi.fn(),
  });
  vi.mocked(useAuth).mockReturnValue({ accessToken: 'test-token' } as any);
  vi.mocked(deliveryApi.getAvailableDates).mockResolvedValue({ dates: [], profileId: null });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DistributorPageHeader', () => {
  it('renders distributor name', () => {
    render(<DistributorPageHeader distributorSlug={slug} />);
    expect(screen.getByText('Fine Wines Co')).toBeTruthy();
  });

  it('renders logo when logoUrl is present', () => {
    const { container } = render(<DistributorPageHeader distributorSlug={slug} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/logo.png');
  });

  it('omits logo element when logoUrl is null', () => {
    vi.mocked(useDistributor).mockReturnValue({
      distributor: { name: 'Fine Wines Co', logoUrl: null, minimumOrderSpend: null } as any,
      hasRelationship: false,
      relationshipMinSpend: null,
      bannerScrolledPast: false,
      setBannerScrolledPast: vi.fn(),
    });
    const { container } = render(<DistributorPageHeader distributorSlug={slug} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('falls back to slug when distributor is not loaded', () => {
    vi.mocked(useDistributor).mockReturnValue({
      distributor: null,
      hasRelationship: null,
      relationshipMinSpend: null,
      bannerScrolledPast: false,
      setBannerScrolledPast: vi.fn(),
    });
    render(<DistributorPageHeader distributorSlug={slug} />);
    expect(screen.getByText(slug)).toBeTruthy();
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

  it('hides Add this supplier button when relationship exists', () => {
    vi.mocked(useDistributor).mockReturnValue({
      distributor: { name: 'Fine Wines Co', logoUrl: null, minimumOrderSpend: null } as any,
      hasRelationship: true,
      relationshipMinSpend: null,
      bannerScrolledPast: false,
      setBannerScrolledPast: vi.fn(),
    });
    render(<DistributorPageHeader distributorSlug={slug} />);
    expect(screen.queryByRole('button', { name: 'Add this supplier' })).toBeNull();
  });

  it('does not call delivery API when no access token', () => {
    vi.mocked(useAuth).mockReturnValue({ accessToken: null } as any);
    render(<DistributorPageHeader distributorSlug={slug} />);
    expect(deliveryApi.getAvailableDates).not.toHaveBeenCalled();
  });

  it('shows minimum order spend when active relationship has one set', () => {
    vi.mocked(useDistributor).mockReturnValue({
      distributor: { name: 'Fine Wines Co', logoUrl: null, minimumOrderSpend: null } as any,
      hasRelationship: true,
      relationshipMinSpend: 150,
      bannerScrolledPast: false,
      setBannerScrolledPast: vi.fn(),
    });
    render(<DistributorPageHeader distributorSlug={slug} />);
    expect(screen.getByText(/minimum order value/)).toBeTruthy();
    expect(screen.getByText(/150\.00/)).toBeTruthy();
  });

  it('shows distributor default minimum spend when no active relationship', () => {
    vi.mocked(useDistributor).mockReturnValue({
      distributor: { name: 'Fine Wines Co', logoUrl: null, minimumOrderSpend: 200 } as any,
      hasRelationship: false,
      relationshipMinSpend: null,
      bannerScrolledPast: false,
      setBannerScrolledPast: vi.fn(),
    });
    render(<DistributorPageHeader distributorSlug={slug} />);
    expect(screen.getByText(/200\.00 minimum order value/)).toBeTruthy();
  });

  it('hides minimum order spend when none is set', () => {
    vi.mocked(useDistributor).mockReturnValue({
      distributor: { name: 'Fine Wines Co', logoUrl: null, minimumOrderSpend: null } as any,
      hasRelationship: true,
      relationshipMinSpend: null,
      bannerScrolledPast: false,
      setBannerScrolledPast: vi.fn(),
    });
    render(<DistributorPageHeader distributorSlug={slug} />);
    expect(screen.queryByText(/minimum order value/)).toBeNull();
  });
});

describe('formatDeliveryParts', () => {
  it('returns parts with time, cutoffDayLabel, dayName, dayOrdinal', () => {
    const parts = formatDeliveryParts('2026-07-07', '2026-07-06T11:50:00.000Z');
    expect(parts.time).toMatch(/\d+:\d+(am|pm)/);
    expect(parts.dayName).toBeTruthy();
    expect(parts.dayOrdinal).toMatch(/\d+(st|nd|rd|th)/);
    expect(parts.cutoffDayLabel).toBeTruthy();
  });

  it('returns 1st ordinal for day 1', () => {
    const parts = formatDeliveryParts('2026-07-01', '2026-06-30T10:00:00.000Z');
    expect(parts.dayOrdinal).toBe('1st');
  });

  it('returns 2nd ordinal for day 2', () => {
    const parts = formatDeliveryParts('2026-07-02', '2026-07-01T10:00:00.000Z');
    expect(parts.dayOrdinal).toBe('2nd');
  });

  it('returns 11th ordinal for day 11 (special case)', () => {
    const parts = formatDeliveryParts('2026-07-11', '2026-07-10T10:00:00.000Z');
    expect(parts.dayOrdinal).toBe('11th');
  });

  it('returns 21st ordinal for day 21', () => {
    const parts = formatDeliveryParts('2026-07-21', '2026-07-20T10:00:00.000Z');
    expect(parts.dayOrdinal).toBe('21st');
  });
});
