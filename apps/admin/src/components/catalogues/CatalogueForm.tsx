'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminCataloguesApi } from '@wholo/admin-api-client';
import type { Catalogue } from '@wholo/types';
import { ProductTransferPanel } from './ProductTransferPanel';

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1, 'Catalogue name is required'),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

// ─── Design primitives ────────────────────────────────────────────────────────

function FormCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-white">
      {title && (
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5">
      {children}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-red-500">{message}</p>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text placeholder-muted/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    />
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CatalogueFormProps {
  mode: 'create' | 'edit';
  catalogue?: Catalogue;
  token: string;
  onSuccess?: (catalogue: Catalogue) => void;
  onCancel?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CatalogueForm({ mode, catalogue, token, onSuccess, onCancel }: CatalogueFormProps) {
  const router = useRouter();
  const isDrawer = !!onCancel;

  const [productIds, setProductIds] = useState<string[]>(() =>
    catalogue ? catalogue.products.map((e) => e.product.id) : [],
  );
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    register,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: catalogue?.name ?? '',
      description: catalogue?.description ?? '',
    },
  });

  const disabled = isSaving || isDeleting;

  async function handleSave() {
    const valid = await trigger();
    if (!valid) return;
    const { name, description } = getValues();
    setApiError(null);
    setIsSaving(true);
    try {
      let saved: Catalogue;
      if (mode === 'create') {
        saved = await adminCataloguesApi.create(token, {
          name,
          description: description || undefined,
          productIds,
        });
      } else {
        saved = await adminCataloguesApi.update(token, catalogue!.id, {
          name,
          description: description || undefined,
          productIds,
        });
      }
      if (onSuccess) {
        onSuccess(saved);
      } else if (mode === 'create') {
        router.push(`/catalogues/${saved.id}/edit`);
      }
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!catalogue) return;
    setIsDeleting(true);
    try {
      await adminCataloguesApi.delete(token, catalogue.id);
      router.push('/catalogues');
    } catch {
      setIsDeleting(false);
      setDeleteConfirm(false);
    }
  }

  return (
    <div className="space-y-0">
      {/* ── Page header ── */}
      <div className="mb-6 flex items-center gap-4">
        {isDrawer ? (
          <>
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-text">
              {mode === 'create' ? 'New catalogue' : (catalogue?.name ?? 'Edit catalogue')}
            </h1>
          </>
        ) : (
          <>
            <Link
              href="/catalogues"
              className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Catalogues
            </Link>
            <span className="text-border">/</span>
            <h1 className="text-xl font-semibold text-text">
              {mode === 'create' ? 'New catalogue' : (catalogue?.name ?? 'Edit catalogue')}
            </h1>
          </>
        )}
      </div>

      {/* ── Main layout ── */}
      <div className={isDrawer ? 'space-y-5' : 'grid grid-cols-1 gap-5 lg:grid-cols-[1fr_288px]'}>

        {/* ── Main column ── */}
        <div className="space-y-5">
          {/* Name + description — isolated form with no submit button → no Enter-key-submit */}
          <form onSubmit={(e) => e.preventDefault()} noValidate>
            <FormCard title="Catalogue details">
              <div className="space-y-4">
                <div>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <TextInput
                    id="name"
                    placeholder="e.g. Standard Wine Range"
                    disabled={disabled}
                    {...register('name')}
                  />
                  <FieldError message={errors.name?.message} />
                </div>
                <div>
                  <FieldLabel htmlFor="description">Description</FieldLabel>
                  <textarea
                    id="description"
                    rows={3}
                    placeholder="Optional notes about this catalogue…"
                    disabled={disabled}
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text placeholder-muted/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                    {...register('description')}
                  />
                </div>
              </div>
            </FormCard>
          </form>

          {/* Products — outside any form to prevent accidental Enter-key submission */}
          <div className="rounded-lg border border-border bg-white overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold text-text">Products</h2>
              <p className="text-xs text-muted mt-0.5">
                {productIds.length === 0
                  ? 'No products in this catalogue yet'
                  : `${productIds.length} product${productIds.length !== 1 ? 's' : ''} — changes are saved when you click Save`}
              </p>
            </div>
            <div className="p-4">
              <ProductTransferPanel
                token={token}
                currentProductIds={productIds}
                onProductIdsChange={setProductIds}
                disabled={disabled}
              />
            </div>
          </div>
        </div>

        {/* ── Right sidebar (full-page mode only) ── */}
        {!isDrawer && (
          <div className="space-y-5">
            <FormCard>
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Actions</p>
                {apiError && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {apiError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={disabled}
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
                >
                  {isSaving ? 'Saving…' : mode === 'create' ? 'Save catalogue' : 'Save changes'}
                </button>
                <Link
                  href="/catalogues"
                  className="block w-full rounded-md border border-border px-4 py-2 text-center text-sm font-medium text-muted transition-colors hover:text-text hover:bg-surface"
                >
                  Discard
                </Link>
              </div>
            </FormCard>

            {mode === 'edit' && catalogue && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                {!deleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(true)}
                    className="w-full rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:border-red-400"
                  >
                    Delete catalogue
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-red-700">Are you sure? This cannot be undone.</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                      >
                        {isDeleting ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(false)}
                        className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer actions (drawer mode) ── */}
      {isDrawer && (
        <>
          {apiError && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {apiError}
            </div>
          )}
          <div className="mt-5 flex items-center justify-end gap-3 border-t border-border pt-5">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={disabled}
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : mode === 'create' ? 'Save catalogue' : 'Save changes'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
