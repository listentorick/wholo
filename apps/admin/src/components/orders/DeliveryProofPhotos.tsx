'use client';

import { useState } from 'react';
import type { DeliveryProofPhoto } from '@wholo/types';

interface DeliveryProofPhotosProps {
  photos: DeliveryProofPhoto[];
}

// Proof photos load straight from R2 via the short-lived presigned URLs carried
// on each photo — no token handling here. Thumbnails in a grid; clicking one
// opens the full-size variant.
export function DeliveryProofPhotos({ photos }: DeliveryProofPhotosProps) {
  const [expanded, setExpanded] = useState<DeliveryProofPhoto | null>(null);

  if (photos.length === 0) {
    return <p className="text-sm text-muted">No photos captured</p>;
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setExpanded(photo)}
            className="aspect-square overflow-hidden rounded-md border border-border bg-canvas transition-opacity hover:opacity-90"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.thumbnailUrl}
              alt="Delivery photo"
              width={photo.width ?? undefined}
              height={photo.height ?? undefined}
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setExpanded(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Delivery photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={expanded.url}
            alt="Delivery photo, full size"
            className="max-h-full max-w-full rounded-md object-contain"
          />
        </div>
      )}
    </>
  );
}
