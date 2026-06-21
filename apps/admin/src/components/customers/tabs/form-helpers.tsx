'use client';

import React from 'react';

export function FormCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-white">
      {title && (
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5"
    >
      {children}
    </label>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-red-500">{message}</p>;
}

export function TextInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text placeholder-muted/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ''}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={3}
      {...props}
      className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text placeholder-muted/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 resize-none"
    />
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function AddressGrid({ prefix, register, disabled }: { prefix: string; register: any; disabled: boolean }) {
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel htmlFor={`${prefix}Line1`}>Address line 1</FieldLabel>
        <TextInput id={`${prefix}Line1`} placeholder="Street address" disabled={disabled} {...register(`${prefix}Line1`)} />
      </div>
      <div>
        <FieldLabel htmlFor={`${prefix}Line2`}>Address line 2</FieldLabel>
        <TextInput id={`${prefix}Line2`} placeholder="Apt, suite, unit, etc." disabled={disabled} {...register(`${prefix}Line2`)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor={`${prefix}City`}>City</FieldLabel>
          <TextInput id={`${prefix}City`} placeholder="Sydney" disabled={disabled} {...register(`${prefix}City`)} />
        </div>
        <div>
          <FieldLabel htmlFor={`${prefix}State`}>State</FieldLabel>
          <TextInput id={`${prefix}State`} placeholder="NSW" disabled={disabled} {...register(`${prefix}State`)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor={`${prefix}Postcode`}>Postcode</FieldLabel>
          <TextInput id={`${prefix}Postcode`} placeholder="2000" disabled={disabled} {...register(`${prefix}Postcode`)} />
        </div>
        <div>
          <FieldLabel htmlFor={`${prefix}Country`}>Country</FieldLabel>
          <TextInput id={`${prefix}Country`} placeholder="Australia" disabled={disabled} {...register(`${prefix}Country`)} />
        </div>
      </div>
    </div>
  );
}

export function WizardSectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">{children}</p>
  );
}
