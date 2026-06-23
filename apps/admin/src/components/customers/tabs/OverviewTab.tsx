'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Customer } from '@wholo/types';
import { adminCustomersApi } from '@wholo/admin-api-client';
import { FormCard, FieldLabel, FieldError, TextInput } from './form-helpers';

const schema = z.object({
  name: z.string().min(1, 'Business name is required'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  customer: Customer;
  token: string;
  onSaved?: () => void;
  onDelete?: () => Promise<void>;
}

export function OverviewTab({ customer, token, onSaved, onDelete }: Props) {
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const org = customer.organisation;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: org.name ?? '',
      email: org.email ?? '',
      phone: org.phone ?? '',
    },
  });

  async function onSubmit(data: FormValues) {
    setSaving(true);
    setSuccess(false);
    setApiError(null);
    try {
      await adminCustomersApi.update(token, customer.id, {
        name: data.name,
        email: data.email || undefined,
        phone: data.phone || undefined,
      });
      setSuccess(true);
      onSaved?.();
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete();
    } catch {
      setIsDeleting(false);
      setDeleteConfirm(false);
    }
  }

  const address = [
    org.addressLine1,
    org.addressLine2,
    [org.addressCity, org.addressState].filter(Boolean).join(' '),
    org.addressPostcode,
    org.addressCountry,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <form id="overview-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <FormCard title="Business details">
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="name">Business name</FieldLabel>
              <TextInput
                id="name"
                placeholder="The Rusty Anchor Bar & Grill"
                disabled={saving}
                {...register('name')}
              />
              <FieldError message={errors.name?.message} />
            </div>

            {org.legalName && (
              <div>
                <FieldLabel>Legal name</FieldLabel>
                <p className="text-sm text-muted">{org.legalName}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <TextInput
                  id="email"
                  type="email"
                  placeholder="orders@example.com"
                  disabled={saving}
                  {...register('email')}
                />
                <FieldError message={errors.email?.message} />
              </div>
              <div>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <TextInput
                  id="phone"
                  type="tel"
                  placeholder="+61 2 9000 0000"
                  disabled={saving}
                  {...register('phone')}
                />
              </div>
            </div>

            {address.length > 0 && (
              <div>
                <FieldLabel>Registered address</FieldLabel>
                <p className="text-sm text-text leading-relaxed">
                  {address.map((line, i) => (
                    <span key={i} className="block">{line}</span>
                  ))}
                </p>
                <p className="mt-1 text-xs text-muted">Managed by the customer — contact them to update.</p>
              </div>
            )}
          </div>

        </FormCard>
      </form>
      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        {apiError && <span className="text-xs font-medium text-red-500">{apiError}</span>}
        {success && <span className="text-xs font-medium text-green-600">Saved</span>}
        <button
          form="overview-form"
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {onDelete && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5">
          <h3 className="mb-3 text-sm font-semibold text-red-800">Danger zone</h3>
          {!deleteConfirm ? (
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:border-red-400"
            >
              Remove customer
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-red-700">Remove this customer relationship? This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {isDeleting ? 'Removing…' : 'Yes, remove'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
