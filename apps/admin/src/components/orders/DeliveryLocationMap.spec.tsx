import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeliveryLocationMap } from './DeliveryLocationMap';

const mapInstance = {
  on: vi.fn((event: string, cb: () => void) => {
    if (event === 'load') cb();
  }),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  remove: vi.fn(),
};
const markerInstance = { setLngLat: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis() };
const MapCtor = vi.fn();
const MarkerCtor = vi.fn();

vi.mock('maplibre-gl', () => ({
  Map: class {
    constructor(...args: unknown[]) {
      MapCtor(...args);
      return mapInstance;
    }
  },
  Marker: class {
    constructor(...args: unknown[]) {
      MarkerCtor(...args);
      return markerInstance;
    }
  },
}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

describe('DeliveryLocationMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs the map centred on the captured point and drops a marker', async () => {
    render(<DeliveryLocationMap latitude={51.51} longitude={-0.12} accuracyM={20} />);

    await waitFor(() => expect(MapCtor).toHaveBeenCalled());
    expect(MapCtor.mock.calls[0][0]).toMatchObject({
      center: [-0.12, 51.51],
      style: 'https://tiles.openfreemap.org/styles/liberty',
      interactive: false,
    });
    expect(markerInstance.setLngLat).toHaveBeenCalledWith([-0.12, 51.51]);
    expect(mapInstance.addSource).toHaveBeenCalledWith('accuracy', expect.objectContaining({ type: 'geojson' }));
  });

  it('skips the accuracy ring when no accuracy is reported', async () => {
    render(<DeliveryLocationMap latitude={51.51} longitude={-0.12} accuracyM={null} />);

    await waitFor(() => expect(MapCtor).toHaveBeenCalled());
    expect(mapInstance.addSource).not.toHaveBeenCalled();
  });
});
