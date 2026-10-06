'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { adminPaymentTermsApi } from '@wholo/admin-api-client';
import type {
  AccountingProvider,
  CreatePaymentTermRequest,
  PaymentTerm,
  PaymentTermPreview,
  PaymentTermRule,
  PaymentTermType,
} from '@wholo/types';
import { FormCard, FieldLabel, FieldError, TextInput } from '@/components/form';
import { DetailPageHeader } from '@/components/detail/DetailPageHeader';
import { DetailPageLayout } from '@/components/detail/DetailPageLayout';
import { DetailActionsPanel, type ActionItem } from '@/components/detail/DetailActionsPanel';
import { StatusBadge } from '@/components/list/StatusBadge';
import { accountingProviderLabel, paymentTermLabel } from '@/lib/payment-term-labels';

// ─── Schema ───────────────────────────────────────────────────────────────────

type EditableType = Exclude<PaymentTermType, 'ACCOUNTING_SYSTEM_DEFAULT'>;

const wholeNumber = (v: string, min: number, max: number) => /^\d+$/.test(v) && +v >= min && +v <= max;

const schema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    type: z.enum(['DUE_IMMEDIATELY', 'DAYS_AFTER_INVOICE', 'DAYS_AFTER_MONTH_END', 'DAY_OF_WEEK', 'DAY_OF_MONTH']),
    invoiceDays: z.string(),
    monthEndDays: z.string(),
    dayOfWeek: z.string(),
    dayOfMonth: z.string(),
    makeDefault: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const days = { DAYS_AFTER_INVOICE: 'invoiceDays', DAYS_AFTER_MONTH_END: 'monthEndDays' } as const;
    if ((v.type === 'DAYS_AFTER_INVOICE' || v.type === 'DAYS_AFTER_MONTH_END') && !wholeNumber(v[days[v.type]], 0, 365)) {
      ctx.addIssue({ code: 'custom', path: [days[v.type]], message: 'Enter a whole number of days from 0 to 365' });
    }
    if (v.type === 'DAY_OF_MONTH' && !wholeNumber(v.dayOfMonth, 1, 31)) {
      ctx.addIssue({ code: 'custom', path: ['dayOfMonth'], message: 'Enter a day from 1 to 31' });
    }
  });

type FormValues = z.infer<typeof schema>;

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The rule the form currently describes, or null while it is incomplete. */
function toRule(v: Omit<FormValues, 'name' | 'makeDefault'>): PaymentTermRule | null {
  switch (v.type) {
    case 'DUE_IMMEDIATELY':
      return { type: v.type };
    case 'DAYS_AFTER_INVOICE':
      return wholeNumber(v.invoiceDays, 0, 365) ? { type: v.type, days: +v.invoiceDays } : null;
    case 'DAYS_AFTER_MONTH_END':
      return wholeNumber(v.monthEndDays, 0, 365) ? { type: v.type, days: +v.monthEndDays } : null;
    case 'DAY_OF_WEEK':
      return { type: v.type, dayOfWeek: +v.dayOfWeek };
    case 'DAY_OF_MONTH':
      return wholeNumber(v.dayOfMonth, 1, 31) ? { type: v.type, dayOfMonth: +v.dayOfMonth } : null;
  }
}

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Live preview ─────────────────────────────────────────────────────────────

// Asks the API (the one place the date maths lives) what the rule does.
function RulePreview({ rule }: { rule: PaymentTermRule | null }) {
  const [preview, setPreview] = useState<PaymentTermPreview | null>(null);
  const [failed, setFailed] = useState(false);
  const key = rule ? JSON.stringify(rule) : null;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      adminPaymentTermsApi
        .preview(JSON.parse(key) as PaymentTermRule)
        .then((p) => {
          if (!cancelled) {
            setPreview(p);
            setFailed(false);
          }
        })
        .catch(() => !cancelled && setFailed(true));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  return (
    <div className="rounded-md border border-border bg-[#fafafa] px-4 py-3" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Example</p>
      {!key ? (
        <p className="mt-1 text-sm text-muted">Finish the rule to see example due dates.</p>
      ) : failed ? (
        <p className="mt-1 text-sm text-muted">Couldn’t load an example right now.</p>
      ) : preview ? (
        <>
          <p className="mt-1 text-sm font-medium text-text">{preview.summary}</p>
          <ul className="mt-2 space-y-1">
            {preview.examples.map((ex) => (
              <li key={ex.invoiceDate} className="text-sm text-text">
                Invoiced {fmtDate(ex.invoiceDate)} <span aria-hidden>→</span>
                <span className="sr-only">,</span> due <span className="font-medium">{ex.dueDate ? fmtDate(ex.dueDate) : '—'}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">Working it out…</p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PaymentTermFormProps {
  mode: 'create' | 'edit';
  initialValues?: PaymentTerm;
  onSubmit: (data: CreatePaymentTermRequest) => Promise<PaymentTerm>;
  onMakeDefault?: () => Promise<void>;
  onDeactivate?: () => Promise<void>;
  onReactivate?: () => Promise<void>;
  /** Viewer without customers:manage: fields disabled, no actions — only a way back. */
  readOnly?: boolean;
  /** The connected accounting integration, which names the built-in term. */
  accountingProvider?: AccountingProvider | null;
}

export function PaymentTermForm({
  mode,
  initialValues,
  onSubmit,
  onMakeDefault,
  onDeactivate,
  onReactivate,
  readOnly = false,
  accountingProvider = null,
}: PaymentTermFormProps) {
  const router = useRouter();
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'default' | 'deactivate' | 'reactivate' | null>(null);
  const isSystem = initialValues?.isSystem ?? false;

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialValues?.name ?? '',
      type: (initialValues && initialValues.type !== 'ACCOUNTING_SYSTEM_DEFAULT' ? initialValues.type : 'DAYS_AFTER_INVOICE') as EditableType,
      invoiceDays: String(initialValues?.type === 'DAYS_AFTER_INVOICE' ? initialValues.days : 30),
      monthEndDays: String(initialValues?.type === 'DAYS_AFTER_MONTH_END' ? initialValues.days : 30),
      dayOfWeek: String(initialValues?.dayOfWeek ?? 5),
      dayOfMonth: String(initialValues?.dayOfMonth ?? 20),
      makeDefault: false,
    },
  });
  const watched = useWatch({ control });
  const rule = toRule({
    type: watched.type ?? 'DAYS_AFTER_INVOICE',
    invoiceDays: watched.invoiceDays ?? '',
    monthEndDays: watched.monthEndDays ?? '',
    dayOfWeek: watched.dayOfWeek ?? '5',
    dayOfMonth: watched.dayOfMonth ?? '',
  });

  async function onFormSubmit(data: FormValues) {
    setApiError(null);
    const formRule = toRule(data)!;
    try {
      const result = await onSubmit({
        name: data.name.trim(),
        // Send every rule field so switching type clears the old ones.
        type: formRule.type,
        days: formRule.days ?? null,
        dayOfWeek: formRule.dayOfWeek ?? null,
        dayOfMonth: formRule.dayOfMonth ?? null,
        ...(mode === 'create' && data.makeDefault && { makeDefault: true }),
      });
      if (mode === 'create') router.push(`/payment-terms/${result.id}/edit`);
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  async function run(kind: 'default' | 'deactivate' | 'reactivate', fn?: () => Promise<void>) {
    if (!fn) return;
    setApiError(null);
    setBusy(kind);
    try {
      await fn();
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  const disabled = isSubmitting || readOnly || isSystem;
  const integration = accountingProvider ? accountingProviderLabel(accountingProvider) : 'your accounting software';
  const customers = initialValues?.customerCount ?? 0;

  const editActions: ActionItem[] = [
    ...(onMakeDefault && initialValues?.active && !initialValues.isDefault
      ? ([{
          key: 'default',
          label: 'Make default',
          loading: busy === 'default',
          loadingLabel: 'Saving…',
          onClick: () => run('default', onMakeDefault),
        }] satisfies ActionItem[])
      : []),
    ...(onReactivate && initialValues && !initialValues.active
      ? ([{
          key: 'reactivate',
          label: 'Reactivate',
          loading: busy === 'reactivate',
          loadingLabel: 'Saving…',
          onClick: () => run('reactivate', onReactivate),
        }] satisfies ActionItem[])
      : []),
    ...(onDeactivate && initialValues?.active && !initialValues.isDefault && !isSystem
      ? ([{
          key: 'deactivate',
          label: 'Deactivate payment term',
          tone: 'danger',
          dangerZone: true,
          loading: busy === 'deactivate',
          loadingLabel: 'Deactivating…',
          onClick: () => run('deactivate', onDeactivate),
          confirm: {
            prompt:
              customers > 0
                ? `${customers} customer${customers === 1 ? '' : 's'} will move to your default payment terms. Orders already accepted keep their due dates.`
                : 'It can no longer be given to customers. Orders already accepted keep their due dates.',
            confirmLabel: 'Yes, deactivate',
          },
        }] satisfies ActionItem[])
      : []),
  ];

  const actions: ActionItem[] = readOnly
    ? [{ key: 'back', label: 'Back to payment terms', href: '/payment-terms' }]
    : isSystem
      ? [...editActions, { key: 'back', label: 'Back to payment terms', href: '/payment-terms' }]
      : [
          {
            key: 'save',
            label: mode === 'create' ? 'Create payment term' : 'Save changes',
            tone: 'primary',
            type: 'submit',
            disabled,
            loading: isSubmitting,
            loadingLabel: 'Saving…',
          },
          { key: 'discard', label: 'Discard', href: '/payment-terms' },
          ...editActions,
        ];

  const radio = (value: EditableType) => ({
    type: 'radio' as const,
    value,
    className: 'mt-0.5 h-4 w-4 accent-primary',
    disabled,
    ...register('type'),
  });
  // Typing into a rule's own field picks that rule.
  const pick = (value: EditableType) => () => setValue('type', value, { shouldValidate: false });
  const inlineInput = 'inline-block w-16 rounded-md border border-border bg-white px-2 py-1 text-sm text-text';

  return (
    <>
      <DetailPageHeader
        backHref="/payment-terms"
        backLabel="Payment terms"
        heading={
          mode === 'create'
            ? 'New payment term'
            : initialValues
              ? paymentTermLabel(initialValues, accountingProvider)
              : 'Edit payment term'
        }
        headingStyle={mode === 'create' ? 'accent' : 'plain'}
        badge={
          initialValues?.isDefault ? (
            <StatusBadge label="Default" tone="blue" />
          ) : initialValues && !initialValues.active ? (
            <StatusBadge label="Inactive" tone="gray" />
          ) : undefined
        }
      />

      <form onSubmit={handleSubmit(onFormSubmit)} noValidate>
        <DetailPageLayout
          sidebar={<DetailActionsPanel layout="sidebar" actions={actions} banner={{ error: apiError }} />}
        >
          {isSystem ? (
            <FormCard title="Accounting integration">
              <p className="text-sm text-text">
                Stocdup doesn’t set a due date. Invoices go to {integration} without one, so {integration} uses the
                customer’s own terms there (or your organisation’s default terms). Stocdup then shows the due date{' '}
                {integration} reports back.
              </p>
              <p className="mt-2 text-sm text-muted">
                {accountingProvider
                  ? 'This is the default until you make one of your own payment terms the default. You can also set it on individual customers from their Account tab.'
                  : 'No accounting integration is connected, so this option isn’t offered to customers.'}
              </p>
            </FormCard>
          ) : (
            <div className="space-y-5">
              <FormCard title="Details">
                <div>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <TextInput id="name" placeholder="e.g. Net 30, 30 days end of month" disabled={disabled} {...register('name')} />
                  <FieldError message={errors.name?.message} />
                </div>
              </FormCard>

              <FormCard title="When payment is due">
                <fieldset className="space-y-1" disabled={disabled}>
                  <legend className="sr-only">When payment is due</legend>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-3 transition-colors hover:bg-[hsl(var(--color-border)/20%)]">
                    <input {...radio('DUE_IMMEDIATELY')} />
                    <span className="text-sm font-medium text-text">On the invoice date (due immediately)</span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-3 transition-colors hover:bg-[hsl(var(--color-border)/20%)]">
                    <input {...radio('DAYS_AFTER_INVOICE')} />
                    <span className="text-sm font-medium text-text">
                      <input
                        aria-label="Days after the invoice date"
                        inputMode="numeric"
                        className={inlineInput}
                        onFocus={pick('DAYS_AFTER_INVOICE')}
                        {...register('invoiceDays', { onChange: pick('DAYS_AFTER_INVOICE') })}
                      />{' '}
                      days after the invoice date
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-3 transition-colors hover:bg-[hsl(var(--color-border)/20%)]">
                    <input {...radio('DAYS_AFTER_MONTH_END')} />
                    <span className="text-sm font-medium text-text">
                      <input
                        aria-label="Days after the end of the invoice month"
                        inputMode="numeric"
                        className={inlineInput}
                        onFocus={pick('DAYS_AFTER_MONTH_END')}
                        {...register('monthEndDays', { onChange: pick('DAYS_AFTER_MONTH_END') })}
                      />{' '}
                      days after the end of the invoice month
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-3 transition-colors hover:bg-[hsl(var(--color-border)/20%)]">
                    <input {...radio('DAY_OF_WEEK')} />
                    <span className="flex flex-wrap items-center gap-x-1 text-sm font-medium text-text">
                      The next
                      <select
                        aria-label="Day of the week"
                        className="rounded-md border border-border bg-white px-2 py-1 text-sm text-text"
                        onFocus={pick('DAY_OF_WEEK')}
                        {...register('dayOfWeek', { onChange: pick('DAY_OF_WEEK') })}
                      >
                        {WEEKDAYS.map((day, i) => (
                          <option key={day} value={String(i + 1)}>
                            {day}
                          </option>
                        ))}
                      </select>
                      after the invoice date
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-3 transition-colors hover:bg-[hsl(var(--color-border)/20%)]">
                    <input {...radio('DAY_OF_MONTH')} />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-text">
                        The next{' '}
                        <input
                          aria-label="Day of the month"
                          inputMode="numeric"
                          className={inlineInput}
                          onFocus={pick('DAY_OF_MONTH')}
                          {...register('dayOfMonth', { onChange: pick('DAY_OF_MONTH') })}
                        />{' '}
                        of the month after the invoice date
                      </span>
                      <span className="text-xs text-muted">31 means the last day, in shorter months too.</span>
                    </span>
                  </label>
                </fieldset>
                <FieldError message={errors.invoiceDays?.message ?? errors.monthEndDays?.message ?? errors.dayOfMonth?.message} />

                <div className="mt-4">
                  <RulePreview rule={rule} />
                </div>

                {mode === 'create' && (
                  <label className="mt-4 flex items-center gap-2 text-sm text-text">
                    <input type="checkbox" className="h-4 w-4 accent-primary" disabled={disabled} {...register('makeDefault')} />
                    Make this the default for customers without their own terms
                  </label>
                )}
                {mode === 'edit' && (
                  <p className="mt-4 text-xs text-muted">
                    Changes apply to orders accepted from now on. Orders already accepted keep their due dates.
                  </p>
                )}
              </FormCard>
            </div>
          )}
        </DetailPageLayout>
      </form>
    </>
  );
}
