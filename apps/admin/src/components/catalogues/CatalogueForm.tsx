'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { adminCataloguesApi } from '@wholo/admin-api-client';
import type { Catalogue } from '@wholo/types';
import { FormCard, FieldLabel, FieldError, TextInput, Textarea } from '@/components/form';
import { DetailPageHeader } from '@/components/detail/DetailPageHeader';
import { DetailPageLayout } from '@/components/detail/DetailPageLayout';
import { DetailActionsPanel, type ActionItem } from '@/components/detail/DetailActionsPanel';
import { ProductTransferPanel } from './ProductTransferPanel';

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1, 'Catalogue name is required'),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface CatalogueFormProps {
  mode: 'create' | 'edit';
  catalogue?: Catalogue;
  onSuccess?: (catalogue: Catalogue) => void;
  onCancel?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CatalogueForm({ mode, catalogue, onSuccess, onCancel }: CatalogueFormProps) {
  const router = useRouter();
  const isDrawer = !!onCancel;

  const [productIds, setProductIds] = useState<string[]>(() =>
    catalogue ? catalogue.products.map((e) => e.product.id) : [],
  );
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
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
        saved = await adminCataloguesApi.create({
          name,
          description: description || undefined,
          productIds,
        });
      } else {
        saved = await adminCataloguesApi.update(catalogue!.id, {
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
      await adminCataloguesApi.delete(catalogue.id);
      router.push('/catalogues');
    } catch {
      setIsDeleting(false);
    }
  }

  const actions: ActionItem[] = [
    {
      key: 'save',
      label: mode === 'create' ? 'Save catalogue' : 'Save changes',
      tone: 'primary',
      onClick: handleSave,
      disabled,
      loading: isSaving,
      loadingLabel: 'Saving…',
    },
    isDrawer
      ? { key: 'cancel', label: 'Cancel', onClick: onCancel }
      : { key: 'discard', label: 'Discard', href: '/catalogues' },
    ...(mode === 'edit' && catalogue && !isDrawer
      ? ([
          {
            key: 'delete',
            label: 'Delete catalogue',
            tone: 'danger',
            dangerZone: true,
            loading: isDeleting,
            loadingLabel: 'Deleting…',
            onClick: handleDelete,
            confirm: { prompt: 'Are you sure? This cannot be undone.', confirmLabel: 'Yes, delete' },
          },
        ] satisfies ActionItem[])
      : []),
  ];

  return (
    <div className="space-y-0">
      <DetailPageHeader
        backHref={isDrawer ? undefined : '/catalogues'}
        backLabel="Catalogues"
        onClose={isDrawer ? onCancel : undefined}
        heading={mode === 'create' ? 'New catalogue' : catalogue?.name ?? 'Edit catalogue'}
        headingStyle={mode === 'create' ? 'accent' : 'plain'}
        size={isDrawer ? 'lg' : 'xl'}
      />

      <DetailPageLayout
        sidebar={
          !isDrawer ? (
            <DetailActionsPanel layout="sidebar" actions={actions} banner={{ error: apiError }} />
          ) : undefined
        }
      >
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
                <Textarea
                  id="description"
                  placeholder="Optional notes about this catalogue…"
                  disabled={disabled}
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
              currentProductIds={productIds}
              onProductIdsChange={setProductIds}
              disabled={disabled}
            />
          </div>
        </div>
      </DetailPageLayout>

      {isDrawer && <DetailActionsPanel layout="footer" actions={actions} banner={{ error: apiError }} />}
    </div>
  );
}
