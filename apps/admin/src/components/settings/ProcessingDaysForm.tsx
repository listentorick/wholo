'use client';

import { useState } from 'react';
import type { DistributorSettings, UpdateDistributorSettingsRequest } from '@wholo/types';
import { FormCard, FieldLabel, SaveButton, SaveBanner } from './shared';

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

export function ProcessingDaysForm({ settings, onSave }: Props) {
  const [selected, setSelected] = useState<number[]>(settings.processingDays ?? [1, 2, 3, 4, 5]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function toggle(day: number) {
    setSelected((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccess(false);
    setSaveError(null);
    try {
      await onSave({ processingDays: selected });
      setSuccess(true);
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section id="processing-days">
      <form onSubmit={handleSubmit}>
        <FormCard
          title="Processing days"
          description="The days your warehouse processes orders. Used to calculate delivery cut-off deadlines."
        >
          <div className="mb-4">
            <FieldLabel>Working days</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map(({ value, label }) => {
                const active = selected.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggle(value)}
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
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
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
