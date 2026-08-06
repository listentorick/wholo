'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { TaxClassification } from '@wholo/types';
import type { TaxType, CreateTaxTypeRequest } from '@wholo/types';
import { FormCard, FieldLabel, FieldError, TextInput, SelectInput } from '@/components/form';
import { DetailPageHeader } from '@/components/detail/DetailPageHeader';
import { DetailPageLayout } from '@/components/detail/DetailPageLayout';
import { DetailActionsPanel, type ActionItem } from '@/components/detail/DetailActionsPanel';
import { StatusBadge } from '@/components/list/StatusBadge';

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  classification: z.nativeEnum(TaxClassification),
  ratePercentage: z
    .string()
    .min(1, 'Rate is required')
    .refine((val) => /^\d+(\.\d{1,2})?$/.test(val) && parseFloat(val) <= 100, 'Enter a rate between 0 and 100'),
});

type FormValues = z.infer<typeof schema>;

const CLASSIFICATION_LABELS: Record<TaxClassification, string> = {
  [TaxClassification.STANDARD]: 'Standard',
  [TaxClassification.REDUCED]: 'Reduced rate',
  [TaxClassification.ZERO_RATED]: 'Zero-rated',
  [TaxClassification.EXEMPT]: 'Exempt',
  [TaxClassification.OUTSIDE_SCOPE]: 'Outside the scope of tax',
};

// ─── Main component ───────────────────────────────────────────────────────────

interface TaxTypeFormProps {
  mode: 'create' | 'edit';
  initialValues?: TaxType;
  onSubmit: (data: CreateTaxTypeRequest) => Promise<TaxType>;
  onDeactivate?: () => Promise<void>;
}

export function TaxTypeForm({ mode, initialValues, onSubmit, onDeactivate }: TaxTypeFormProps) {
  const router = useRouter();
  const [apiError, setApiError] = useState<string | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialValues?.name ?? '',
      classification: initialValues?.classification ?? TaxClassification.STANDARD,
      ratePercentage: initialValues?.ratePercentage ?? '',
    },
  });

  async function onFormSubmit(data: FormValues) {
    setApiError(null);
    try {
      const result = await onSubmit({
        name: data.name,
        classification: data.classification,
        ratePercentage: parseFloat(data.ratePercentage).toFixed(2),
      });
      if (mode === 'create') {
        router.push(`/tax-types/${result.id}/edit`);
      }
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  async function handleDeactivate() {
    if (!onDeactivate) return;
    setIsDeactivating(true);
    try {
      await onDeactivate();
    } catch {
      setIsDeactivating(false);
    }
  }

  const disabled = isSubmitting;

  const actions: ActionItem[] = [
    {
      key: 'save',
      label: mode === 'create' ? 'Create tax type' : 'Save changes',
      tone: 'primary',
      type: 'submit',
      disabled,
      loading: isSubmitting,
      loadingLabel: 'Saving…',
    },
    { key: 'discard', label: 'Discard', href: '/tax-types' },
    ...(mode === 'edit' && onDeactivate && initialValues?.active
      ? ([
          {
            key: 'deactivate',
            label: 'Deactivate tax type',
            tone: 'danger',
            dangerZone: true,
            loading: isDeactivating,
            loadingLabel: 'Deactivating…',
            onClick: handleDeactivate,
            confirm: {
              prompt: 'Products using it keep their assignment, but it can no longer be assigned to new products.',
              confirmLabel: 'Yes, deactivate',
            },
          },
        ] satisfies ActionItem[])
      : []),
  ];

  return (
    <>
      <DetailPageHeader
        backHref="/tax-types"
        backLabel="Tax types"
        heading={mode === 'create' ? 'New tax type' : initialValues?.name ?? 'Edit tax type'}
        headingStyle={mode === 'create' ? 'accent' : 'plain'}
        badge={
          initialValues?.isDefault ? (
            <StatusBadge label="Default — needs review" tone="yellow" />
          ) : initialValues && !initialValues.active ? (
            <StatusBadge label="Inactive" tone="gray" />
          ) : undefined
        }
      />

      <form onSubmit={handleSubmit(onFormSubmit)} noValidate>
        <DetailPageLayout
          sidebar={<DetailActionsPanel layout="sidebar" actions={actions} banner={{ error: apiError }} />}
        >
          <FormCard title="Details">
            <div className="space-y-4">
              {initialValues?.isDefault && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  This is the default tax type assigned automatically to products that had none. Rename it and set
                  its real rate, or create a proper tax type and reassign affected products to it.
                </p>
              )}
              <div>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <TextInput
                  id="name"
                  placeholder="e.g. Standard rate, Zero-rated"
                  disabled={disabled}
                  {...register('name')}
                />
                <FieldError message={errors.name?.message} />
              </div>
              <div>
                <FieldLabel htmlFor="classification">Classification</FieldLabel>
                <SelectInput id="classification" disabled={disabled} {...register('classification')}>
                  {Object.values(TaxClassification).map((c) => (
                    <option key={c} value={c}>
                      {CLASSIFICATION_LABELS[c]}
                    </option>
                  ))}
                </SelectInput>
                <p className="mt-1 text-xs text-muted">
                  Zero-rated, exempt and outside-scope all charge £0 tax but stay distinguishable on orders.
                </p>
              </div>
              <div className="max-w-[calc(50%-0.5rem)]">
                <FieldLabel htmlFor="ratePercentage">Rate</FieldLabel>
                <div className="relative">
                  <TextInput
                    id="ratePercentage"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    disabled={disabled}
                    style={{ paddingRight: '1.75rem' }}
                    {...register('ratePercentage')}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">%</span>
                </div>
                <FieldError message={errors.ratePercentage?.message} />
              </div>
            </div>
          </FormCard>
        </DetailPageLayout>
      </form>
    </>
  );
}
