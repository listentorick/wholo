'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { OrderAcceptanceMode } from '@wholo/types';
import type { DistributorSettings, UpdateDistributorSettingsRequest } from '@wholo/types';
import { FormCard } from '../shared';

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

const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

interface Props {
  settings: DistributorSettings;
  onSave: (data: UpdateDistributorSettingsRequest) => Promise<void>;
}

export function OrdersTab({ settings, onSave }: Props) {
  const [processingDays, setProcessingDays] = useState<number[]>(
    settings.processingDays ?? [1, 2, 3, 4, 5],
  );
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      defaultOrderAcceptanceMode: settings.defaultOrderAcceptanceMode,
    },
  });

  function toggleDay(day: number) {
    setProcessingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  async function onSubmit(data: FormValues) {
    setSaving(true);
    setSuccess(false);
    setApiError(null);
    try {
      await onSave({
        defaultOrderAcceptanceMode: data.defaultOrderAcceptanceMode,
        processingDays,
      });
      setSuccess(true);
    } catch {
      setApiError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <FormCard title="Order acceptance" description="Control how incoming orders from customers are handled.">
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
          {errors.defaultOrderAcceptanceMode && (
            <p className="mt-1 text-xs text-red-500">{errors.defaultOrderAcceptanceMode.message}</p>
          )}
        </div>
      </FormCard>

      <FormCard title="Processing days" description="The days your warehouse processes orders. Used to calculate delivery cut-off deadlines.">
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map(({ value, label }) => {
            const active = processingDays.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleDay(value)}
                className={[
                  'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-white text-muted hover:border-primary/50 hover:text-text',
                ].join(' ')}
              >
                {label}
              </button>
            );
          })}
        </div>
      </FormCard>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        {apiError && <span className="text-xs font-medium text-red-500">{apiError}</span>}
        {success && <span className="text-xs font-medium text-green-600">Saved</span>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
