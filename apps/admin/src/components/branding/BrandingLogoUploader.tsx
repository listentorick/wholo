'use client';

import { useState, useEffect, useRef, useCallback, DragEvent } from 'react';
import type { AssetImage } from '@wholo/types';
import { adminAssetImagesApi } from '@wholo/admin-api-client';

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPTED_EXT = '.jpg,.jpeg,.png,.webp';
const ASSET_TYPE = 'distributor-logo';

interface Props {
  token: string;
  distributorId: string;
}

export function BrandingLogoUploader({ token, distributorId }: Props) {
  const [image, setImage] = useState<AssetImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    adminAssetImagesApi
      .list(token, ASSET_TYPE, distributorId)
      .then((imgs) => setImage(imgs[0] ?? null))
      .catch(() => setError('Failed to load logo.'))
      .finally(() => setLoading(false));
  }, [token, distributorId]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (!ACCEPTED_MIME.includes(file.type)) {
        setError('Unsupported format — use JPG, PNG, or WebP.');
        return;
      }
      setError(null);
      setUploading(true);
      try {
        if (image) {
          await adminAssetImagesApi.delete(token, image.id);
        }
        const uploaded = await adminAssetImagesApi.upload(token, ASSET_TYPE, distributorId, file);
        setImage(uploaded);
      } catch {
        setError('Upload failed. Please try again.');
      } finally {
        setUploading(false);
      }
    },
    [token, distributorId, image],
  );

  async function handleDelete() {
    if (!image) return;
    const prev = image;
    setImage(null);
    try {
      await adminAssetImagesApi.delete(token, prev.id);
    } catch {
      setImage(prev);
      setError('Failed to delete logo. Please try again.');
    }
  }

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
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  }

  const logoUrl = image?.variants['full'] ?? image?.variants['thumb'] ?? null;

  return (
    <div className="space-y-5">
      {/* Preview */}
      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-border bg-[hsl(var(--color-border)/20%)]">
            {loading ? (
              <div className="h-full w-full animate-pulse bg-[hsl(var(--color-border)/30%)]" />
            ) : logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8 text-muted">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              </div>
            )}
          </div>
          {image && !uploading && (
            <button
              type="button"
              onClick={handleDelete}
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white border border-border text-text shadow-sm transition-colors hover:text-red-600"
              aria-label="Remove logo"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-2.5 w-2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-text">
            {image ? 'Logo uploaded' : 'No logo set'}
          </p>
          <p className="mt-0.5 text-xs text-muted">Appears as a circle in the portal header</p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !uploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && !uploading && fileInputRef.current?.click()}
        aria-label="Upload logo"
        className={[
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-7 text-center transition-colors select-none outline-none',
          'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          uploading ? 'cursor-not-allowed opacity-60' : '',
          isDragOver
            ? 'border-primary bg-[hsl(var(--color-primary)/6%)]'
            : 'border-border hover:border-primary/60 hover:bg-[hsl(var(--color-border)/10%)]',
        ].join(' ')}
      >
        {uploading ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={['h-5 w-5', isDragOver ? 'text-primary' : 'text-muted'].join(' ')}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm text-muted">
              {isDragOver ? 'Drop to upload' : image ? 'Replace logo' : 'Upload logo'}
            </p>
            <p className="text-xs text-muted/70">JPG · PNG · WebP · up to 5 MB</p>
          </>
        )}
        <input ref={fileInputRef} type="file" accept={ACCEPTED_EXT} onChange={handleInputChange} className="hidden" />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
    </div>
  );
}
