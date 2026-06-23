'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Customer } from '@wholo/types';
import type { DeliveryProfileSummary } from '@wholo/types';
import { adminCustomersApi, adminDeliveryProfilesApi } from '@wholo/admin-api-client';
import { FormCard, AddressGrid, WizardSectionHeading } from './form-helpers';

const schema = z.object({
  deliveryLine1: z.string().optional(),
  deliveryLine2: z.string().optional(),
  deliveryCity: z.string().optional(),
  deliveryState: z.string().optional(),
  deliveryPostcode: z.string().optional(),
  deliveryCountry: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  customer: Customer;
  token: string;
  mode: 'tab' | 'wizard';
  onSaved?: () => void;
  onNext?: () => void;
  onBack?: () => void;
}

export function DeliveryTab({ customer, token, mode, onSaved, onNext, onBack }: Props) {
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<DeliveryProfileSummary[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState(customer.deliveryProfileId ?? '');

  useEffect(() => {
    adminDeliveryProfilesApi
      .list(token, { limit: 100 })
      .then((res) => setProfiles(res.data.filter((p) => p.active)))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    setSelectedProfileId(customer.deliveryProfileId ?? '');
  }, [customer.deliveryProfileId]);

  const { register, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      deliveryLine1: customer.deliveryLine1 ?? '',
      deliveryLine2: customer.deliveryLine2 ?? '',
      deliveryCity: customer.deliveryCity ?? '',
      deliveryState: customer.deliveryState ?? '',
      deliveryPostcode: customer.deliveryPostcode ?? '',
      deliveryCountry: customer.deliveryCountry ?? '',
    },
  });

  async function onSubmit(data: FormValues) {
    setSaving(true);
    setSuccess(false);
    setApiError(null);
    try {
      await adminCustomersApi.update(token, customer.id, {
        deliveryLine1: data.deliveryLine1 || undefined,
        deliveryLine2: data.deliveryLine2 || undefined,
        deliveryCity: data.deliveryCity || undefined,
        deliveryState: data.deliveryState || undefined,
        deliveryPostcode: data.deliveryPostcode || undefined,
        deliveryCountry: data.deliveryCountry || undefined,
      });
      await adminDeliveryProfilesApi.assignToCustomer(token, customer.id, {
        deliveryProfileId: selectedProfileId || null,
      });
      if (mode === 'wizard') {
        onNext?.();
      } else {
        setSuccess(true);
        onSaved?.();
      }
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (mode === 'wizard') {
    return (
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-text">Delivery</h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="space-y-3">
            <WizardSectionHeading>Delivery address</WizardSectionHeading>
            <p className="text-xs text-muted -mt-1">Leave blank to use the customer&apos;s registered address.</p>
            <AddressGrid prefix="delivery" register={register} disabled={saving} />
          </div>
          <div className="space-y-2">
            <WizardSectionHeading>Delivery profile</WizardSectionHeading>
            <select
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              disabled={saving}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
            >
              <option value="">— No delivery profile —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <button type="button" onClick={onBack} className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text">
            ← Back
          </button>
          <div className="flex items-center gap-3">
            {apiError && <span className="text-xs font-medium text-red-500">{apiError}</span>}
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Next →'}
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <FormCard title="Delivery address">
        <p className="mb-4 text-xs text-muted">Leave blank to use the customer&apos;s registered address.</p>
        <AddressGrid prefix="delivery" register={register} disabled={saving} />
      </FormCard>

      <FormCard title="Delivery profile">
        <select
          value={selectedProfileId}
          onChange={(e) => setSelectedProfileId(e.target.value)}
          disabled={saving}
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
        >
          <option value="">— No delivery profile —</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </FormCard>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        {apiError && <span className="text-xs font-medium text-red-500">{apiError}</span>}
        {success && <span className="text-xs font-medium text-green-600">Saved</span>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
