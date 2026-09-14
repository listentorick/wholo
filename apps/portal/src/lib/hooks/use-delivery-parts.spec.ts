import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@wholo/api-client', () => ({
  deliveryApi: { getAvailableDates: vi.fn() },
}));

import { deliveryApi } from '@wholo/api-client';
import { useDeliveryParts, formatDeliveryParts, formatOrdinalDate, formatTime } from './use-delivery-parts';

const slug = 'fine-wines-co';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deliveryApi.getAvailableDates).mockResolvedValue({ dates: [], profileId: null });
});

describe('useDeliveryParts', () => {
  it('returns null and does not call the API when no access token', () => {
    const { result } = renderHook(() => useDeliveryParts(slug, null));
    expect(result.current).toBeNull();
    expect(deliveryApi.getAvailableDates).not.toHaveBeenCalled();
  });

  it('returns null and does not call the API when disabled', () => {
    const { result } = renderHook(() => useDeliveryParts(slug, 'token', { enabled: false }));
    expect(result.current).toBeNull();
    expect(deliveryApi.getAvailableDates).not.toHaveBeenCalled();
  });

  it('returns formatted delivery parts when dates are available', async () => {
    vi.mocked(deliveryApi.getAvailableDates).mockResolvedValue({
      dates: [{ date: '2026-07-07', cutoffDeadline: '2026-07-06T11:50:00.000Z' }],
      profileId: 'profile-1',
    });
    const { result } = renderHook(() => useDeliveryParts(slug, 'token'));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.dayName).toBeTruthy();
  });

  it('returns null when dates array is empty', async () => {
    const { result } = renderHook(() => useDeliveryParts(slug, 'token'));
    await waitFor(() => expect(deliveryApi.getAvailableDates).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('returns null when the API call fails', async () => {
    vi.mocked(deliveryApi.getAvailableDates).mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useDeliveryParts(slug, 'token'));
    await waitFor(() => expect(deliveryApi.getAvailableDates).toHaveBeenCalled());
    expect(result.current).toBeNull();
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

describe('formatOrdinalDate', () => {
  it('returns dayName, dayOrdinal, and monthName', () => {
    const parts = formatOrdinalDate(new Date(2026, 8, 15));
    expect(parts.dayName).toBe('Tuesday');
    expect(parts.dayOrdinal).toBe('15th');
    expect(parts.monthName).toBe('September');
  });

  it('returns 1st ordinal for day 1', () => {
    expect(formatOrdinalDate(new Date(2026, 6, 1)).dayOrdinal).toBe('1st');
  });

  it('returns 2nd ordinal for day 2', () => {
    expect(formatOrdinalDate(new Date(2026, 6, 2)).dayOrdinal).toBe('2nd');
  });

  it('returns 11th ordinal for day 11 (special case)', () => {
    expect(formatOrdinalDate(new Date(2026, 6, 11)).dayOrdinal).toBe('11th');
  });

  it('returns 21st ordinal for day 21', () => {
    expect(formatOrdinalDate(new Date(2026, 6, 21)).dayOrdinal).toBe('21st');
  });
});

describe('formatTime', () => {
  it('formats afternoon times as h:mmpm', () => {
    expect(formatTime(new Date(2026, 8, 14, 18, 0))).toBe('6:00pm');
  });

  it('formats morning times as h:mmam', () => {
    expect(formatTime(new Date(2026, 8, 14, 9, 5))).toBe('9:05am');
  });

  it('formats midnight as 12:00am', () => {
    expect(formatTime(new Date(2026, 8, 14, 0, 0))).toBe('12:00am');
  });

  it('formats noon as 12:00pm', () => {
    expect(formatTime(new Date(2026, 8, 14, 12, 0))).toBe('12:00pm');
  });
});
