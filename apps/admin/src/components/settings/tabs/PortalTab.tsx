'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { DistributorSettings, UpdateDistributorSettingsRequest } from '@wholo/types';
import { FormCard, FieldLabel, TextInput, Textarea, SaveButton, SaveBanner } from '../shared';
import { WizardStepFooter } from '../../onboarding/WizardStepFooter';

const schema = z.object({
  tagline: z.string().optional(),
  aboutText: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  settings: DistributorSettings;
  onSave: (data: UpdateDistributorSettingsRequest) => Promise<void>;
  /** 'wizard' embeds this form as an onboarding step (Back/Skip/Next chrome). */
  mode?: 'tab' | 'wizard';
  onNext?: () => void;
  onBack?: () => void;
}

export function PortalTab({ settings, onSave, mode = 'tab', onNext, onBack }: Props) {
  const [success, setSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      tagline: settings.tagline ?? '',
      aboutText: settings.aboutText ?? '',
    },
  });

  async function onSubmit(data: FormValues) {
    setSuccess(false);
    setSaveError(null);
    try {
      await onSave({
        tagline: data.tagline || undefined,
        aboutText: data.aboutText || undefined,
      });
      if (mode === 'wizard') onNext?.();
      else setSuccess(true);
    } catch {
      setSaveError('Failed to save. Please try again.');
    }
  }

  const fields = (
    <div className="space-y-4">
      <div>
        <FieldLabel htmlFor="tagline">Tagline</FieldLabel>
        <TextInput
          id="tagline"
          placeholder="Passionate about wine since 1987"
          {...register('tagline')}
        />
      </div>

      <div>
        <FieldLabel htmlFor="aboutText">About us</FieldLabel>
        <Textarea
          id="aboutText"
          rows={10}
          placeholder="Tell your story — who you are, what you distribute, and how you work with trade customers…"
          {...register('aboutText')}
        />
        <p className="mt-1.5 text-xs text-muted">Supports Markdown — headings, bold, bullet lists, and links.</p>
      </div>
    </div>
  );

  if (mode === 'wizard') {
    return (
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-text">Your portal’s About page</h2>
        </div>
        <div className="p-5">{fields}</div>
        <WizardStepFooter onBack={onBack} onSkip={onNext} saving={isSubmitting} error={saveError} />
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <FormCard
        title="About page"
        description="Content shown on the About page of your customer portal. Visible to all visitors at your portal URL."
      >
        {fields}
      </FormCard>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <SaveBanner success={success} error={saveError} />
        <div className="ml-auto">
          <SaveButton isSubmitting={isSubmitting} />
        </div>
      </div>
    </form>
  );
}
