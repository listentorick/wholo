'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { OrderAcceptanceMode } from '@wholo/types';
import type { DistributorSettings, UpdateDistributorSettingsRequest } from '@wholo/types';
import { FormCard, SaveButton, SaveBanner } from './shared';

const schema = z.object({
  defaultOrderAcceptanceMode: z.nativeEnum(OrderAcceptanceMode),
});

type FormValues = z.infer<typeof schema>;

const MODE_OPTIONS: { value: OrderAcceptanceMode; label: string; description: string }[] = [
  {
    value: OrderAcceptanceMode.MANUAL,
    label: 'Manual review',
    description: 'Each order is held until you accept or reject it.',
  },
  {
    value: OrderAcceptanceMode.AUTO_ON_SUBMISSION,
    label: 'Auto-accept on submission',
    description: 'Orders are accepted automatically when a customer submits them.',
  },
];

interface Props {
  settings: DistributorSettings;
  onSave: (data: UpdateDistributorSettingsRequest) => Promise<void>;
}

export function OrderSettingsForm({ settings, onSave }: Props) {
  const [success, setSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      defaultOrderAcceptanceMode: settings.defaultOrderAcceptanceMode,
    },
  });

  async function onSubmit(data: FormValues) {
    setSuccess(false);
    setSaveError(null);
    try {
      await onSave({ defaultOrderAcceptanceMode: data.defaultOrderAcceptanceMode });
      setSuccess(true);
    } catch {
      setSaveError('Failed to save. Please try again.');
    }
  }

  return (
    <section id="orders">
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormCard title="Order settings" description="Control how incoming orders from customers are handled.">
          <div className="space-y-2">
            {MODE_OPTIONS.map(({ value, label, description }) => (
              <label
                key={value}
                className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-3 transition-colors hover:bg-[hsl(var(--color-border)/20%)]"
              >
                <input
                  type="radio"
                  value={value}
                  className="mt-0.5 h-4 w-4 accent-primary"
                  {...register('defaultOrderAcceptanceMode')}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-text">{label}</span>
                  <span className="text-xs text-muted">{description}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
            <SaveBanner success={success} error={saveError} />
            <div className="ml-auto">
              <SaveButton isSubmitting={isSubmitting} />
            </div>
          </div>
        </FormCard>
      </form>
    </section>
  );
}
