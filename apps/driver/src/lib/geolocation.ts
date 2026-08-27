import { DeviceLocation } from '@/types/delivery';

// Best-effort device location, captured once per delivery (PRD §11). Never
// rejects and never blocks the flow — any failure (no API, permission refused,
// timeout, position error) resolves to `{ unavailable: true }`.
export function captureDeviceLocation(timeoutMs = 10_000): Promise<DeviceLocation> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ unavailable: true });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : undefined,
          capturedAt: new Date(pos.timestamp).toISOString(),
        });
      },
      () => resolve({ unavailable: true }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
