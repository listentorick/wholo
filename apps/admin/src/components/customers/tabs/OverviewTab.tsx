'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Customer } from '@wholo/types';
import { adminCustomersApi } from '@wholo/admin-api-client';
import { FormCard, FieldLabel, FieldError, TextInput } from './form-helpers';
import type { OnTabSaveStateChange } from './tab-save-state';

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
  onSaveStateChange?: OnTabSaveStateChange;
}

export function OverviewTab({ customer, token, onSaved, onSaveStateChange }: Props) {
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

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

  useEffect(() => {
    onSaveStateChange?.({
      label: 'Save',
      onSave: () => handleSubmit(onSubmit)(),
      saving,
      success: success ? 'Saved' : null,
      error: apiError,
    });
    return () => onSaveStateChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, success, apiError]);

  const address = [
    org.addressLine1,
    org.addressLine2,
    [org.addressCity, org.addressState].filter(Boolean).join(' '),
    org.addressPostcode,
    org.addressCountry,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
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
    </div>
  );
}
