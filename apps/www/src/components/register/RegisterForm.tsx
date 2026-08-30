'use client';

import { useState } from 'react';
import { REGISTER } from '@/content';
import { RegisterConfirmation } from './RegisterConfirmation';

const fieldClass =
  'w-full rounded-md border border-border px-3 py-2.5 text-[15px] text-navy outline-none focus:border-primary focus:ring-2 focus:ring-primary/30';

/**
 * Presentational form with a stubbed submit that shows the confirmation state.
 * A later change wires validation + POST /api/register + email.
 */
export function RegisterForm() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    await new Promise((r) => setTimeout(r, 400));
    setStatus('success');
  }

  if (status === 'success') return <RegisterConfirmation />;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg bg-white p-6 sm:p-8">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">
          Your name
          <input name="name" type="text" autoComplete="name" placeholder="Full name" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">
          Work email
          <input name="email" type="email" autoComplete="email" placeholder="you@company.co.uk" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">
          Business name
          <input name="business" type="text" autoComplete="organization" placeholder="Company Ltd" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">
          Your role
          <select name="role" className={`${fieldClass} bg-white`} defaultValue={REGISTER.roles[0]}>
            {REGISTER.roles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
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
              <input type="checkbox" name="interests" value={interest} className="sr-only" />
              {interest}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">
        Anything else <span className="font-normal text-muted">(optional)</span>
        <textarea
          name="message"
          rows={3}
          placeholder="How you take orders today, the systems you use, roughly how many trade customers."
          className={`${fieldClass} resize-none`}
        />
      </label>

      {/* Honeypot — real submissions leave this empty (wired later). */}
      <input type="text" name="company_url" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

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
