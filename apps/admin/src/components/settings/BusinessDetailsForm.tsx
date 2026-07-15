'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { DistributorSettings, UpdateDistributorSettingsRequest } from '@wholo/types';
import { FormCard, FieldLabel, FieldError, TextInput, SaveButton, SaveBanner } from './shared';

const schema = z.object({
  name: z.string().min(1, 'Business name is required'),
  email: z.string().email('Enter a valid email').or(z.literal('')).optional(),
  phone: z.string().optional(),
  slug: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  addressPostcode: z.string().optional(),
  addressCountry: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  settings: DistributorSettings;
  onSave: (data: UpdateDistributorSettingsRequest) => Promise<void>;
}

export function BusinessDetailsForm({ settings, onSave }: Props) {
  const [success, setSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: settings.name,
      email: settings.email ?? '',
      phone: settings.phone ?? '',
      slug: settings.slug ?? '',
      addressLine1: settings.addressLine1 ?? '',
      addressLine2: settings.addressLine2 ?? '',
      addressCity: settings.addressCity ?? '',
      addressState: settings.addressState ?? '',
      addressPostcode: settings.addressPostcode ?? '',
      addressCountry: settings.addressCountry ?? '',
    },
  });

  async function onSubmit(data: FormValues) {
    setSuccess(false);
    setSaveError(null);
    try {
      await onSave({
        name: data.name,
        email: data.email || undefined,
        phone: data.phone || undefined,
        slug: data.slug || undefined,
        addressLine1: data.addressLine1 || undefined,
        addressLine2: data.addressLine2 || undefined,
        addressCity: data.addressCity || undefined,
        addressState: data.addressState || undefined,
        addressPostcode: data.addressPostcode || undefined,
        addressCountry: data.addressCountry || undefined,
      });
      setSuccess(true);
    } catch {
      setSaveError('Failed to save. Please try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormCard title="Business details" description="Your distributor's public-facing business information.">
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="name">Business name</FieldLabel>
              <TextInput id="name" placeholder="Acme Wine Co." {...register('name')} />
              <FieldError message={errors.name?.message} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="email">Contact email</FieldLabel>
                <TextInput id="email" type="email" placeholder="hello@acme.com" {...register('email')} />
                <FieldError message={errors.email?.message} />
              </div>
              <div>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <TextInput id="phone" type="tel" placeholder="+61 400 000 000" {...register('phone')} />
                <FieldError message={errors.phone?.message} />
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="slug">Portal URL slug</FieldLabel>
              <TextInput id="slug" placeholder="acme-wine" autoComplete="off" {...register('slug')} />
              <FieldError message={errors.slug?.message} />
              {settings.slug && (
                <p className="mt-1.5 text-xs text-muted">
                  Portal URL: <span className="font-mono">…/{settings.slug}</span>
                </p>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Business address</p>
              <div className="space-y-4">
                <div>
                  <FieldLabel htmlFor="addressLine1">Address line 1</FieldLabel>
                  <TextInput id="addressLine1" placeholder="123 Main Street" autoComplete="address-line1" {...register('addressLine1')} />
                </div>
                <div>
                  <FieldLabel htmlFor="addressLine2">Address line 2</FieldLabel>
                  <TextInput id="addressLine2" placeholder="Suite 4" autoComplete="address-line2" {...register('addressLine2')} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="addressCity">City</FieldLabel>
                    <TextInput id="addressCity" placeholder="Sydney" autoComplete="address-level2" {...register('addressCity')} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="addressState">State / region</FieldLabel>
                    <TextInput id="addressState" placeholder="NSW" autoComplete="address-level1" {...register('addressState')} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="addressPostcode">Postcode</FieldLabel>
                    <TextInput id="addressPostcode" placeholder="2000" autoComplete="postal-code" {...register('addressPostcode')} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="addressCountry">Country</FieldLabel>
                    <TextInput id="addressCountry" placeholder="Australia" autoComplete="country-name" {...register('addressCountry')} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <SaveBanner success={success} error={saveError} />
              <div className="ml-auto">
                <SaveButton isSubmitting={isSubmitting} />
              </div>
            </div>
          </div>
        </FormCard>
    </form>
  );
}
