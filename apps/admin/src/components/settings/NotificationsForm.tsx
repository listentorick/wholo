'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { DistributorSettings, UpdateDistributorSettingsRequest } from '@wholo/types';
import { FormCard, FieldLabel, FieldError, TextInput, SaveButton, SaveBanner } from './shared';
import { WizardStepFooter } from '../onboarding/WizardStepFooter';

const schema = z.object({
  newEmail: z.string().email('Enter a valid email').or(z.literal('')),
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

export function NotificationsForm({ settings, onSave, mode = 'tab', onNext, onBack }: Props) {
  const [emails, setEmails] = useState<string[]>(settings.orderNotificationEmails);
  const [success, setSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newEmail: '' },
  });

  function addEmail(data: FormValues) {
    const email = data.newEmail.trim();
    if (!email || emails.includes(email)) return;
    setEmails((prev) => [...prev, email]);
    reset({ newEmail: '' });
  }

  function removeEmail(email: string) {
    setEmails((prev) => prev.filter((e) => e !== email));
  }

  async function save() {
    setSuccess(false);
    setSaveError(null);
    setIsSaving(true);
    try {
      await onSave({ orderNotificationEmails: emails });
      if (mode === 'wizard') onNext?.();
      else setSuccess(true);
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  const fields = (
    <div className="space-y-4">
      <form onSubmit={handleSubmit(addEmail)}>
        <FieldLabel htmlFor="newEmail">Add email address</FieldLabel>
        <div className="flex gap-2">
          <TextInput
            id="newEmail"
            type="email"
            placeholder="orders@acme.com"
            {...register('newEmail')}
          />
          <button
            type="submit"
            className="shrink-0 rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-[hsl(var(--color-border)/20%)]"
          >
            Add
          </button>
        </div>
        <FieldError message={errors.newEmail?.message} />
      </form>

      {emails.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {emails.map((email) => (
            <span
              key={email}
              className="flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-text"
            >
              {email}
              <button
                type="button"
                onClick={() => removeEmail(email)}
                className="ml-0.5 text-muted hover:text-text"
                aria-label={`Remove ${email}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {emails.length === 0 && (
        <p className="text-xs text-muted">No notification emails added yet.</p>
      )}
    </div>
  );

  if (mode === 'wizard') {
    return (
      <div>
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-text">Order notifications</h2>
        </div>
        <div className="p-5">{fields}</div>
        <WizardStepFooter onBack={onBack} onSkip={onNext} onNext={save} saving={isSaving} error={saveError} />
      </div>
    );
  }

  return (
    <FormCard
        title="Notifications"
        description="Email addresses that receive a notification when a new order is submitted."
      >
        <div className="space-y-4">
          {fields}
          <div className="flex items-center justify-between pt-1 border-t border-border mt-2">
            <SaveBanner success={success} error={saveError} />
            <div className="ml-auto">
              <button
                type="button"
                onClick={save}
                disabled={isSaving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
    </FormCard>
  );
}
