'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { DistributorSettings, UpdateDistributorSettingsRequest } from '@wholo/types';
import { FormCard, FieldLabel, FieldError, Textarea, SaveButton, SaveBanner } from './shared';
import { WizardStepFooter } from '../onboarding/WizardStepFooter';

const schema = z.object({
  marketplaceVisible: z.boolean(),
  marketplaceDescription: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  settings: DistributorSettings;
  onSave: (data: UpdateDistributorSettingsRequest) => Promise<void>;
  /** 'wizard' embeds this form as an onboarding step (Back/Skip/Next chrome). */
  mode?: 'tab' | 'wizard';
  onNext?: () => void;
  onBack?: () => void;
  /** Label for the wizard primary button (the closing step says "Finish"). */
  wizardNextLabel?: string;
}

export function DiscoverySettingsForm({ settings, onSave, mode = 'tab', onNext, onBack, wizardNextLabel }: Props) {
  const [success, setSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      marketplaceVisible: settings.marketplaceVisible,
      marketplaceDescription: settings.marketplaceDescription ?? '',
    },
  });

  const isVisible = watch('marketplaceVisible');

  async function onSubmit(data: FormValues) {
    setSuccess(false);
    setSaveError(null);
    try {
      await onSave({
        marketplaceVisible: data.marketplaceVisible,
        marketplaceDescription: data.marketplaceDescription || undefined,
      });
      if (mode === 'wizard') onNext?.();
      else setSuccess(true);
    } catch {
      setSaveError('Failed to save. Please try again.');
    }
  }

  const fields = (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-center justify-between rounded-md border border-border px-4 py-3">
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-text">Visible in marketplace</span>
          <span className="text-xs text-muted">
            {isVisible
              ? 'Trade customers can find and request access to your business.'
              : 'Your business is hidden from the marketplace.'}
          </span>
        </span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          {...register('marketplaceVisible')}
        />
      </label>

      <div>
        <FieldLabel htmlFor="marketplaceDescription">Marketplace description</FieldLabel>
        <Textarea
          id="marketplaceDescription"
          placeholder="Tell trade customers who you are and what you distribute…"
          rows={4}
          {...register('marketplaceDescription')}
        />
        <FieldError message={errors.marketplaceDescription?.message} />
      </div>
    </div>
  );

  if (mode === 'wizard') {
    return (
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-text">Discovery & marketplace</h2>
        </div>
        <div className="p-5">{fields}</div>
        <WizardStepFooter
          onBack={onBack}
          onSkip={onNext}
          nextLabel={wizardNextLabel ?? 'Save & continue'}
          saving={isSubmitting}
          error={saveError}
        />
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormCard
          title="Discovery & marketplace"
          description="Control whether your business appears in the Wholo distributor marketplace."
        >
          <div className="space-y-4">
            {fields}
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
