'use client';

import { FieldLabel, TextInput } from '@/components/form';

export { FormCard, FieldLabel, FieldError, TextInput, Textarea } from '@/components/form';

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
