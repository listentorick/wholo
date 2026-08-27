'use client';

import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Feature, Polygon } from 'geojson';

interface DeliveryLocationMapProps {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
}

// A GeoJSON polygon approximating a circle of `radiusM` metres around a point —
// so the accuracy ring scales correctly with zoom (a pixel-radius circle layer
// would not represent real metres).
function metresCircle(lng: number, lat: number, radiusM: number, steps = 64): Feature<Polygon> {
  const coords: [number, number][] = [];
  const earthR = 6_378_137;
  const dLat = (radiusM / earthR) * (180 / Math.PI);
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(theta), lat + dLat * Math.sin(theta)]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
}

// Captured delivery location (PRD §19). MapLibre GL JS + OpenFreeMap's hosted
// OSM-derived vector tiles (free, no API key). Non-interactive — a pin plus an
// accuracy ring, nothing to click. Attribution comes from the style + the
// default control, which PRD §19 requires we keep.
export function DeliveryLocationMap({ latitude, longitude, accuracyM }: DeliveryLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let map: import('maplibre-gl').Map | undefined;

    (async () => {
      const maplibregl = await import('maplibre-gl');
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [longitude, latitude],
        zoom: 15,
        interactive: false,
      });

      map.on('load', () => {
        if (!map) return;
        if (accuracyM && accuracyM > 0) {
          map.addSource('accuracy', { type: 'geojson', data: metresCircle(longitude, latitude, accuracyM) });
          map.addLayer({
            id: 'accuracy-fill',
            type: 'fill',
            source: 'accuracy',
            paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.12 },
          });
          map.addLayer({
            id: 'accuracy-line',
            type: 'line',
            source: 'accuracy',
            paint: { 'line-color': '#2563eb', 'line-opacity': 0.4, 'line-width': 1 },
          });
        }
        new maplibregl.Marker({ color: '#F2864D' }).setLngLat([longitude, latitude]).addTo(map);
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [latitude, longitude, accuracyM]);

  return (
    <div
      ref={containerRef}
      className="h-[200px] w-full overflow-hidden rounded-md border border-border bg-canvas"
      aria-label="Map of the captured delivery location"
      role="img"
    />
  );
}
