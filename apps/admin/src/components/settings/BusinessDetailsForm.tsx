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
      });
      setSuccess(true);
    } catch {
      setSaveError('Failed to save. Please try again.');
    }
  }

  return (
    <section id="business">
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
              <TextInput id="slug" placeholder="acme-wine" {...register('slug')} />
              <FieldError message={errors.slug?.message} />
              {settings.slug && (
                <p className="mt-1.5 text-xs text-muted">
                  Portal URL: <span className="font-mono">…/d/{settings.slug}</span>
                </p>
              )}
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
    </section>
  );
}
