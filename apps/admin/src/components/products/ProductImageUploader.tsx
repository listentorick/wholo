'use client';

import { useState, useEffect, useRef, useCallback, DragEvent } from 'react';
import type { AssetImage } from '@wholo/types';
import { adminAssetImagesApi } from '@wholo/admin-api-client';

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPTED_EXT = '.jpg,.jpeg,.png,.webp';

interface Props {
  token: string;
  productId: string;
}

interface UploadSlot {
  id: string;
  filename: string;
}

export function ProductImageUploader({ token, productId }: Props) {
  const [images, setImages] = useState<AssetImage[]>([]);
  const [uploadSlots, setUploadSlots] = useState<UploadSlot[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    adminAssetImagesApi
      .list(token, 'product-image', productId)
      .then(setImages)
      .catch(() => setError('Failed to load images.'))
      .finally(() => setLoading(false));
  }, [token, productId]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      const rejected: string[] = [];
      const valid = files.filter((f) => {
        if (!ACCEPTED_MIME.includes(f.type)) {
          rejected.push(f.name);
          return false;
        }
        return true;
      });

      if (rejected.length > 0) {
        setError(
          `${rejected.length === 1 ? `"${rejected[0]}"` : `${rejected.length} files`} not supported — use JPG, PNG, or WebP.`,
        );
      }
      if (!valid.length) return;

      const slots: UploadSlot[] = valid.map((f) => ({
        id: crypto.randomUUID(),
        filename: f.name,
      }));
      setUploadSlots((prev) => [...prev, ...slots]);

      await Promise.all(
        valid.map(async (file, i) => {
          try {
            const uploaded = await adminAssetImagesApi.upload(
              token,
              'product-image',
              productId,
              file,
            );
            setImages((prev) => [...prev, uploaded]);
          } catch {
            setError(`Failed to upload "${file.name}". Please try again.`);
          } finally {
            setUploadSlots((prev) => prev.filter((s) => s.id !== slots[i].id));
          }
        }),
      );
    },
    [token, productId],
  );

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  }

  async function handleDelete(imageId: string) {
    setImages((prev) => prev.filter((img) => img.id !== imageId));
    try {
      await adminAssetImagesApi.delete(token, imageId);
    } catch {
      adminAssetImagesApi
        .list(token, 'product-image', productId)
        .then(setImages)
        .catch(() => null);
      setError('Failed to delete image. Please try again.');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
        <span className="text-xs text-muted">Loading images…</span>
      </div>
    );
  }

  const hasContent = images.length > 0 || uploadSlots.length > 0;

  return (
    <div className="space-y-4">
      {hasContent && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img) => (
            <ImageTile key={img.id} image={img} onDelete={() => handleDelete(img.id)} />
          ))}
          {uploadSlots.map((slot) => (
            <UploadingSkeleton key={slot.id} filename={slot.filename} />
          ))}
        </div>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        aria-label="Upload product images"
        className={[
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors select-none outline-none',
          'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          isDragOver
            ? 'border-primary bg-[hsl(var(--color-primary)/6%)]'
            : 'border-border hover:border-primary/60 hover:bg-[hsl(var(--color-border)/10%)]',
        ].join(' ')}
      >
        <div
          className={[
            'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
            isDragOver ? 'bg-primary/10' : 'bg-[hsl(var(--color-border)/30%)]',
          ].join(' ')}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className={[
              'h-5 w-5 transition-colors',
              isDragOver ? 'text-primary' : 'text-muted',
            ].join(' ')}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
            />
          </svg>
        </div>

        <div>
          <p className="text-sm font-medium text-text">
            {isDragOver ? 'Drop to upload' : 'Drag images here or click to browse'}
          </p>
          <p className="mt-1 text-xs text-muted">JPG · PNG · WebP · up to 10 MB each</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXT}
          onChange={handleInputChange}
          className="hidden"
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

function ImageTile({ image, onDelete }: { image: AssetImage; onDelete: () => void }) {
  const thumbUrl = image.variants['thumb'] ?? image.variants['catalogue'] ?? '';

  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-surface">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbUrl}
        alt=""
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        draggable={false}
      />

      {image.isPrimary && (
        <div className="absolute left-2 top-2">
          <span className="inline-flex items-center rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold text-primary-fg backdrop-blur-sm">
            Primary
          </span>
        </div>
      )}

      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-text transition-colors hover:bg-white hover:text-red-600"
          aria-label="Delete image"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-3.5 w-3.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function UploadingSkeleton({ filename }: { filename: string }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-surface">
      <div className="absolute inset-0 animate-pulse bg-[hsl(var(--color-border)/30%)]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
        <p className="max-w-full truncate text-[10px] text-muted">{filename}</p>
      </div>
    </div>
  );
}
