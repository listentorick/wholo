'use client';

import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { REGISTER } from '@/content';
import { leadSchema, type Lead } from '@/lib/lead-schema';
import { track } from '@/lib/analytics';
import { RegisterConfirmation } from './RegisterConfirmation';

const fieldClass =
  'w-full rounded-md border border-border px-3 py-2.5 text-[15px] text-navy outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function RegisterForm({ variant = 'default' }: { variant?: string }) {
  const mountedAt = useRef(Date.now());
  const startedRef = useRef(false);
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Lead>({
    resolver: zodResolver(leadSchema),
    defaultValues: { name: '', email: '', business: '', role: REGISTER.roles[0], interests: [], message: '' },
  });

  function onFirstInteraction() {
    if (startedRef.current) return;
    startedRef.current = true;
    track('form_start', { variant });
  }

  async function onSubmit(data: Lead) {
    setStatus('submitting');
    setFormError(null);
    track('form_submit', { variant });

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...data, elapsedMs: Date.now() - mountedAt.current }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        fields?: Record<string, string[]>;
      };

      if (res.ok && json.ok) {
        track('form_success', { variant });
        setStatus('success');
        return;
      }

      if (res.status === 422 && json.fields) {
        for (const [name, messages] of Object.entries(json.fields)) {
          setError(name as keyof Lead, { message: messages[0] });
        }
        setFormError('Please check the highlighted fields.');
      } else if (res.status === 429) {
        setFormError('That is a few too many attempts. Please try again a little later.');
      } else {
        setFormError('Something went wrong sending your details. Please try again, or email hello@stocdup.com.');
      }
      track('form_error', { variant, code: String(res.status) });
      setStatus('error');
    } catch {
      setFormError('Could not reach the server. Please check your connection and try again.');
      track('form_error', { variant, code: 'network' });
      setStatus('error');
    }
  }

  if (status === 'success') return <RegisterConfirmation />;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      onFocusCapture={onFirstInteraction}
      noValidate
      className="flex flex-col gap-4 rounded-lg bg-white p-6 sm:p-8"
    >
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Your name" error={errors.name?.message}>
          <input {...register('name')} type="text" autoComplete="name" placeholder="Full name" className={fieldClass} />
        </Field>
        <Field label="Work email" error={errors.email?.message}>
          <input {...register('email')} type="email" autoComplete="email" placeholder="you@company.co.uk" className={fieldClass} />
        </Field>
        <Field label="Business name" error={errors.business?.message}>
          <input {...register('business')} type="text" autoComplete="organization" placeholder="Company Ltd" className={fieldClass} />
        </Field>
        <Field label="Your role" error={errors.role?.message}>
          <select {...register('role')} className={`${fieldClass} bg-white`}>
            {REGISTER.roles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-semibold text-navy">
          What would make the biggest difference?{' '}
          <span className="font-normal text-muted">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {REGISTER.interests.map((interest) => (
            <label
              key={interest}
              className="cursor-pointer rounded-md border border-border px-3 py-[7px] text-[13px] text-muted transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:text-navy"
            >
              <input {...register('interests')} type="checkbox" value={interest} className="sr-only" />
              {interest}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Anything else" optional error={errors.message?.message}>
        <textarea
          {...register('message')}
          rows={3}
          placeholder="How you take orders today, the systems you use, roughly how many trade customers."
          className={`${fieldClass} resize-none`}
        />
      </Field>

      {/* Honeypot — hidden from people, tempting to bots. */}
      <div aria-hidden className="hidden">
        <label>
          Company website
          <input name="company_url" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {formError && (
        <p role="alert" className="text-[13px] font-medium text-[#DC2626]">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="mt-1 inline-flex items-center justify-center rounded-md bg-primary px-4 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {status === 'submitting' ? 'Sending…' : 'Register interest'}
      </button>

      <p className="text-[12.5px] text-muted">
        {REGISTER.privacy}{' '}
        <a href="/privacy" className="text-primary underline hover:text-primary-hover">
          See our privacy notice
        </a>
        .
      </p>
    </form>
  );
}

function Field({
  label,
  optional,
  error,
  children,
}: {
  label: string;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">
      <span>
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </span>
      {children}
      {error && <span className="font-normal text-[#DC2626]">{error}</span>}
    </label>
  );
}
