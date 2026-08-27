'use client';

import { useRef } from 'react';
import { Plus, X, RotateCw } from 'lucide-react';

export interface PhotoItem {
  clientId: string;
  previewUrl: string;
  status: 'uploading' | 'done' | 'error';
  photoId?: string;
}

interface DeliveryPhotosProps {
  photos: PhotoItem[];
  onAdd: (file: File) => void;
  onRemove: (clientId: string) => void;
  onRetry: (clientId: string) => void;
  max?: number;
}

// The mock's "Delivery photos" section (screenshots/delivery_2.png). Optional —
// photo capture never gates the flow (PRD §25). Controlled: the page owns the
// list and the upload lifecycle.
export function DeliveryPhotos({ photos, onAdd, onRemove, onRetry, max = 10 }: DeliveryPhotosProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div className="mb-1 block text-sm font-medium text-foreground">Delivery photos</div>

      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <div key={photo.clientId} className="relative aspect-square border border-border bg-canvas">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.previewUrl} alt="Delivery photo" className="h-full w-full object-cover" />

            {photo.status === 'uploading' && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                <div
                  role="status"
                  aria-label="Uploading photo"
                  className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent"
                />
              </div>
            )}

            {photo.status === 'error' && (
              <button
                type="button"
                onClick={() => onRetry(photo.clientId)}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/80 text-xs font-medium text-error"
              >
                <RotateCw className="h-5 w-5" aria-hidden="true" />
                Retry
              </button>
            )}

            <button
              type="button"
              onClick={() => onRemove(photo.clientId)}
              aria-label="Remove photo"
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center bg-foreground/70 text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}

        {photos.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 border border-dashed border-accent text-sm font-medium text-accent"
          >
            <Plus className="h-6 w-6" aria-hidden="true" />
            Add photo
          </button>
        )}
      </div>

      <p className="mt-2 text-sm text-foreground-tertiary">Add a photo of the delivery (optional)</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Add delivery photo"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onAdd(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
