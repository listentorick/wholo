import { describe, it, expect, vi, afterEach } from 'vitest';
import { captureDeviceLocation } from './geolocation';

const original = navigator.geolocation;
afterEach(() => {
  Object.defineProperty(navigator, 'geolocation', { value: original, configurable: true });
});

function stubGeolocation(impl: Partial<Geolocation>) {
  Object.defineProperty(navigator, 'geolocation', { value: impl, configurable: true });
}

describe('captureDeviceLocation', () => {
  it('resolves to structured coordinates on success', async () => {
    stubGeolocation({
      getCurrentPosition: (success) =>
        success({
          coords: { latitude: 53.72, longitude: -1.86, accuracy: 12 },
          timestamp: Date.parse('2026-08-27T10:00:00Z'),
        } as GeolocationPosition),
    });

    await expect(captureDeviceLocation()).resolves.toEqual({
      latitude: 53.72,
      longitude: -1.86,
      accuracyM: 12,
      capturedAt: '2026-08-27T10:00:00.000Z',
    });
  });

  it('resolves to { unavailable: true } on a position error (never rejects)', async () => {
    stubGeolocation({
      getCurrentPosition: (_success, error) => error?.({ code: 1, message: 'denied' } as GeolocationPositionError),
    });
    await expect(captureDeviceLocation()).resolves.toEqual({ unavailable: true });
  });

  it('resolves to { unavailable: true } when the API is absent', async () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
    await expect(captureDeviceLocation()).resolves.toEqual({ unavailable: true });
  });
});
