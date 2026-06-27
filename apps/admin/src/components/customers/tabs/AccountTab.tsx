'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Customer } from '@wholo/types';
import { adminCustomersApi } from '@wholo/admin-api-client';
import { FormCard, FieldLabel, FieldError, TextInput, Textarea, AddressGrid, WizardSectionHeading } from './form-helpers';

const schema = z.object({
  accountNumber: z.string().optional(),
  creditLimit: z
    .string()
    .optional()
    .refine(
      (v) => !v || (/^\d+(\.\d{0,2})?$/.test(v) && parseFloat(v) >= 0),
      'Enter a valid amount (e.g. 5000.00)',
    ),
  minimumOrderSpend: z
    .string()
    .optional()
    .refine(
      (v) => !v || (/^\d+(\.\d{0,2})?$/.test(v) && parseFloat(v) >= 0),
      'Enter a valid amount (e.g. 50.00)',
    ),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  billingLine1: z.string().optional(),
  billingLine2: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingPostcode: z.string().optional(),
  billingCountry: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  customer: Customer;
  token: string;
  mode: 'tab' | 'wizard';
  onSaved?: () => void;
  onNext?: () => void;
  onBack?: () => void;
}

export function AccountTab({ customer, token, mode, onSaved, onNext, onBack }: Props) {
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      accountNumber: customer.accountNumber ?? '',
      creditLimit: customer.creditLimit ?? '',
      minimumOrderSpend: customer.minimumOrderSpend ?? '',
      paymentTerms: customer.paymentTerms ?? '',
      notes: customer.notes ?? '',
      billingLine1: customer.billingLine1 ?? '',
      billingLine2: customer.billingLine2 ?? '',
      billingCity: customer.billingCity ?? '',
      billingState: customer.billingState ?? '',
      billingPostcode: customer.billingPostcode ?? '',
      billingCountry: customer.billingCountry ?? '',
    },
  });

  async function onSubmit(data: FormValues) {
    setSaving(true);
    setSuccess(false);
    setApiError(null);
    try {
      await adminCustomersApi.update(token, customer.id, {
        accountNumber: data.accountNumber || undefined,
        creditLimit: data.creditLimit || undefined,
        minimumOrderSpend: data.minimumOrderSpend || undefined,
        paymentTerms: data.paymentTerms || undefined,
        notes: data.notes || undefined,
        billingLine1: data.billingLine1 || undefined,
        billingLine2: data.billingLine2 || undefined,
        billingCity: data.billingCity || undefined,
        billingState: data.billingState || undefined,
        billingPostcode: data.billingPostcode || undefined,
        billingCountry: data.billingCountry || undefined,
      });
      if (mode === 'tab') {
        setSuccess(true);
        onSaved?.();
      } else {
        onNext?.();
      }
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const disabled = saving;

  if (mode === 'wizard') {
    return (
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-text">Account details</h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="space-y-4">
            <WizardSectionHeading>Commercial terms</WizardSectionHeading>
            <div>
              <FieldLabel htmlFor="accountNumber">Account number</FieldLabel>
              <TextInput id="accountNumber" placeholder="ACC-001" disabled={disabled} {...register('accountNumber')} />
            </div>
            <div>
              <FieldLabel htmlFor="creditLimit">Credit limit</FieldLabel>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">$</span>
                <TextInput id="creditLimit" type="text" inputMode="decimal" placeholder="0.00" disabled={disabled} style={{ paddingLeft: '1.75rem' }} {...register('creditLimit')} />
              </div>
              <FieldError message={errors.creditLimit?.message} />
            </div>
            <div>
              <FieldLabel htmlFor="minimumOrderSpend">Minimum order</FieldLabel>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">$</span>
                <TextInput id="minimumOrderSpend" type="text" inputMode="decimal" placeholder="0.00" disabled={disabled} style={{ paddingLeft: '1.75rem' }} {...register('minimumOrderSpend')} />
              </div>
              <FieldError message={errors.minimumOrderSpend?.message} />
            </div>
            <div>
              <FieldLabel htmlFor="paymentTerms">Payment terms</FieldLabel>
              <TextInput id="paymentTerms" placeholder="30 days net" disabled={disabled} {...register('paymentTerms')} />
            </div>
            <div>
              <FieldLabel htmlFor="notes">Notes</FieldLabel>
              <Textarea id="notes" placeholder="Internal notes about this customer…" disabled={disabled} {...register('notes')} />
            </div>
          </div>

          <div className="space-y-3">
            <WizardSectionHeading>Billing address</WizardSectionHeading>
            <AddressGrid prefix="billing" register={register} disabled={disabled} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <button type="button" onClick={onBack} className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text">
            ← Back
          </button>
          <div className="flex items-center gap-3">
            {apiError && <span className="text-xs font-medium text-red-500">{apiError}</span>}
            <button
              type="submit"
              disabled={disabled}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Next →'}
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <FormCard title="Commercial terms">
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="accountNumber">Account number</FieldLabel>
            <TextInput id="accountNumber" placeholder="ACC-001" disabled={disabled} {...register('accountNumber')} />
          </div>
          <div>
            <FieldLabel htmlFor="creditLimit">Credit limit</FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">$</span>
              <TextInput id="creditLimit" type="text" inputMode="decimal" placeholder="0.00" disabled={disabled} style={{ paddingLeft: '1.75rem' }} {...register('creditLimit')} />
            </div>
            <FieldError message={errors.creditLimit?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="minimumOrderSpend">Minimum order</FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">$</span>
              <TextInput id="minimumOrderSpend" type="text" inputMode="decimal" placeholder="0.00" disabled={disabled} style={{ paddingLeft: '1.75rem' }} {...register('minimumOrderSpend')} />
            </div>
            <FieldError message={errors.minimumOrderSpend?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="paymentTerms">Payment terms</FieldLabel>
            <TextInput id="paymentTerms" placeholder="30 days net" disabled={disabled} {...register('paymentTerms')} />
          </div>
          <div>
            <FieldLabel htmlFor="notes">Notes</FieldLabel>
            <Textarea id="notes" placeholder="Internal notes about this customer…" disabled={disabled} {...register('notes')} />
          </div>
        </div>
      </FormCard>

      <FormCard title="Billing address">
        <AddressGrid prefix="billing" register={register} disabled={disabled} />
      </FormCard>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        {apiError && <span className="text-xs font-medium text-red-500">{apiError}</span>}
        {success && <span className="text-xs font-medium text-green-600">Saved</span>}
        <button
          type="submit"
          disabled={disabled}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
