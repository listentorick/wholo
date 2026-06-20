'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { TradeRelationshipStatus, InvitationStatus } from '@wholo/types';
import type { Customer, CreateCustomerRequest, InviteResponse } from '@wholo/types';
import { CustomerCatalogues } from './CustomerCatalogues';
import { CustomerPriceList } from './CustomerPriceList';
import { CustomerDeliveryProfile } from './CustomerDeliveryProfile';

// ─── Schema ──────────────────────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1, 'Business name is required'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  accountNumber: z.string().optional(),
  creditLimit: z
    .string()
    .optional()
    .refine(
      (v) => !v || (/^\d+(\.\d{0,2})?$/.test(v) && parseFloat(v) >= 0),
      'Enter a valid amount (e.g. 5000.00)',
    ),
  paymentTerms: z.string().optional(),
  deliveryLine1: z.string().optional(),
  deliveryLine2: z.string().optional(),
  deliveryCity: z.string().optional(),
  deliveryState: z.string().optional(),
  deliveryPostcode: z.string().optional(),
  deliveryCountry: z.string().optional(),
  billingLine1: z.string().optional(),
  billingLine2: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingPostcode: z.string().optional(),
  billingCountry: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<TradeRelationshipStatus, { label: string; bg: string; text: string }> = {
  [TradeRelationshipStatus.PENDING_INVITE]: { label: 'Pending invite', bg: '#fef9c3', text: '#a16207' },
  [TradeRelationshipStatus.PENDING_REQUEST]: { label: 'Pending request', bg: '#dbeafe', text: '#1d4ed8' },
  [TradeRelationshipStatus.ACTIVE]: { label: 'Active', bg: '#dcfce7', text: '#15803d' },
  [TradeRelationshipStatus.SUSPENDED]: { label: 'Suspended', bg: '#fee2e2', text: '#b91c1c' },
  [TradeRelationshipStatus.INACTIVE]: { label: 'Inactive', bg: '#f3f4f6', text: '#6b7280' },
};

const INVITE_STATUS_LABELS: Record<InvitationStatus, { label: string; color: string }> = {
  [InvitationStatus.PENDING]: { label: 'Pending', color: '#d97706' },
  [InvitationStatus.ACCEPTED]: { label: 'Accepted', color: '#16a34a' },
  [InvitationStatus.EXPIRED]: { label: 'Expired', color: '#6b7280' },
  [InvitationStatus.REVOKED]: { label: 'Revoked', color: '#6b7280' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function FormCard({ title, children }: { title?: string; children: React.ReactNode }) {
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

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5"
    >
      {children}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-red-500">{message}</p>;
}

function TextInput({ id, placeholder, disabled, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      id={id}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text placeholder-muted/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    />
  );
}

function AddressGrid({ prefix, register, disabled }: { prefix: string; register: any; disabled: boolean }) {
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel htmlFor={`${prefix}Line1`}>Address line 1</FieldLabel>
        <TextInput
          id={`${prefix}Line1`}
          placeholder="Street address"
          disabled={disabled}
          {...register(`${prefix}Line1`)}
        />
      </div>
      <div>
        <FieldLabel htmlFor={`${prefix}Line2`}>Address line 2</FieldLabel>
        <TextInput
          id={`${prefix}Line2`}
          placeholder="Apt, suite, unit, etc."
          disabled={disabled}
          {...register(`${prefix}Line2`)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor={`${prefix}City`}>City</FieldLabel>
          <TextInput
            id={`${prefix}City`}
            placeholder="Sydney"
            disabled={disabled}
            {...register(`${prefix}City`)}
          />
        </div>
        <div>
          <FieldLabel htmlFor={`${prefix}State`}>State</FieldLabel>
          <TextInput
            id={`${prefix}State`}
            placeholder="NSW"
            disabled={disabled}
            {...register(`${prefix}State`)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor={`${prefix}Postcode`}>Postcode</FieldLabel>
          <TextInput
            id={`${prefix}Postcode`}
            placeholder="2000"
            disabled={disabled}
            {...register(`${prefix}Postcode`)}
          />
        </div>
        <div>
          <FieldLabel htmlFor={`${prefix}Country`}>Country</FieldLabel>
          <TextInput
            id={`${prefix}Country`}
            placeholder="Australia"
            disabled={disabled}
            {...register(`${prefix}Country`)}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CustomerFormProps {
  mode: 'create' | 'edit';
  token: string;
  initialValues?: Customer;
  onSubmit: (data: CreateCustomerRequest) => Promise<{ inviteUrl?: string | null } | void>;
  onDelete?: () => Promise<void>;
  onInvite?: () => Promise<InviteResponse>;
  onOrderAs?: () => Promise<{ portalUrl: string }>;
}

export function CustomerForm({ mode, token, initialValues, onSubmit, onDelete, onInvite, onOrderAs }: CustomerFormProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [isOrderingAs, setIsOrderingAs] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<InviteResponse | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialValues?.organisation.name ?? '',
      email: initialValues?.organisation.email ?? '',
      phone: initialValues?.organisation.phone ?? '',
      accountNumber: initialValues?.accountNumber ?? '',
      creditLimit: initialValues?.creditLimit ?? '',
      paymentTerms: initialValues?.paymentTerms ?? '',
      deliveryLine1: initialValues?.deliveryLine1 ?? '',
      deliveryLine2: initialValues?.deliveryLine2 ?? '',
      deliveryCity: initialValues?.deliveryCity ?? '',
      deliveryState: initialValues?.deliveryState ?? '',
      deliveryPostcode: initialValues?.deliveryPostcode ?? '',
      deliveryCountry: initialValues?.deliveryCountry ?? '',
      billingLine1: initialValues?.billingLine1 ?? '',
      billingLine2: initialValues?.billingLine2 ?? '',
      billingCity: initialValues?.billingCity ?? '',
      billingState: initialValues?.billingState ?? '',
      billingPostcode: initialValues?.billingPostcode ?? '',
      billingCountry: initialValues?.billingCountry ?? '',
    },
  });

  async function onFormSubmit(data: FormValues) {
    setApiError(null);
    try {
      const result = await onSubmit({
        name: data.name,
        email: data.email || undefined,
        phone: data.phone || undefined,
        accountNumber: data.accountNumber || undefined,
        creditLimit: data.creditLimit || undefined,
        paymentTerms: data.paymentTerms || undefined,
        deliveryLine1: data.deliveryLine1 || undefined,
        deliveryLine2: data.deliveryLine2 || undefined,
        deliveryCity: data.deliveryCity || undefined,
        deliveryState: data.deliveryState || undefined,
        deliveryPostcode: data.deliveryPostcode || undefined,
        deliveryCountry: data.deliveryCountry || undefined,
        billingLine1: data.billingLine1 || undefined,
        billingLine2: data.billingLine2 || undefined,
        billingCity: data.billingCity || undefined,
        billingState: data.billingState || undefined,
        billingPostcode: data.billingPostcode || undefined,
        billingCountry: data.billingCountry || undefined,
      });
      if (result && 'inviteUrl' in result && result.inviteUrl) {
        setInviteUrl(result.inviteUrl);
      }
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete();
    } catch {
      setIsDeleting(false);
      setDeleteConfirm(false);
    }
  }

  async function handleInvite() {
    if (!onInvite) return;
    setIsInviting(true);
    try {
      const res = await onInvite();
      setInviteResult(res);
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Failed to send invitation.');
    } finally {
      setIsInviting(false);
    }
  }

  async function handleOrderAs() {
    if (!onOrderAs) return;
    setIsOrderingAs(true);
    try {
      const { portalUrl } = await onOrderAs();
      window.open(portalUrl, '_blank', 'noopener');
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Failed to start order session.');
    } finally {
      setIsOrderingAs(false);
    }
  }

  const disabled = isSubmitting;
  const inv = initialValues?.latestInvitation;
  const statusMeta = initialValues ? STATUS_LABELS[initialValues.status] : null;

  return (
    <>
      {/* Invite URL banner (create mode success) */}
      {inviteUrl && (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="mb-1.5 text-sm font-semibold text-emerald-800">Customer added! Share this invitation link:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-white border border-emerald-200 px-3 py-1.5 text-xs text-emerald-900 font-mono break-all">
              {inviteUrl}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(inviteUrl)}
              className="shrink-0 rounded border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Resend invite result */}
      {inviteResult && (
        <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-5 py-4">
          <p className="mb-1.5 text-sm font-semibold text-blue-800">New invitation link generated:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-white border border-blue-200 px-3 py-1.5 text-xs text-blue-900 font-mono break-all">
              {inviteResult.inviteUrl}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(inviteResult.inviteUrl)}
              className="shrink-0 rounded border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/customers"
          className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Customers
        </Link>
        <span className="text-border">/</span>
        <h1 className="text-xl font-semibold text-text">
          {mode === 'create' ? 'Add customer' : (initialValues?.organisation.name ?? 'Edit customer')}
        </h1>
        {statusMeta && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: statusMeta.bg, color: statusMeta.text }}
          >
            {statusMeta.label}
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit(onFormSubmit)} noValidate>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_256px]">

          {/* ── Left column — data ── */}
          <div className="space-y-5">
            <FormCard title="Business details">
              <div className="space-y-4">
                <div>
                  <FieldLabel htmlFor="name">Business name</FieldLabel>
                  <TextInput
                    id="name"
                    placeholder="The Rusty Anchor Bar & Grill"
                    disabled={disabled}
                    {...register('name')}
                  />
                  <FieldError message={errors.name?.message} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <TextInput
                      id="email"
                      type="email"
                      placeholder="orders@example.com"
                      disabled={disabled}
                      {...register('email')}
                    />
                    <FieldError message={errors.email?.message} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="phone">Phone</FieldLabel>
                    <TextInput
                      id="phone"
                      type="tel"
                      placeholder="+61 2 9000 0000"
                      disabled={disabled}
                      {...register('phone')}
                    />
                  </div>
                </div>
              </div>
            </FormCard>

            <FormCard title="Account details">
              <div className="space-y-4">
                <div>
                  <FieldLabel htmlFor="accountNumber">Account number</FieldLabel>
                  <TextInput
                    id="accountNumber"
                    placeholder="ACC-001"
                    disabled={disabled}
                    {...register('accountNumber')}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="creditLimit">Credit limit</FieldLabel>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">$</span>
                    <TextInput
                      id="creditLimit"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      disabled={disabled}
                      style={{ paddingLeft: '1.75rem' }}
                      {...register('creditLimit')}
                    />
                  </div>
                  <FieldError message={errors.creditLimit?.message} />
                </div>
                <div>
                  <FieldLabel htmlFor="paymentTerms">Payment terms</FieldLabel>
                  <TextInput
                    id="paymentTerms"
                    placeholder="30 days net"
                    disabled={disabled}
                    {...register('paymentTerms')}
                  />
                </div>
              </div>
            </FormCard>

            <FormCard title="Delivery address">
              <AddressGrid prefix="delivery" register={register} disabled={disabled} />
            </FormCard>

            <FormCard title="Billing address">
              <AddressGrid prefix="billing" register={register} disabled={disabled} />
            </FormCard>

            {/* Catalogues (edit mode only) */}
            {mode === 'edit' && initialValues && (
              <FormCard title="Catalogues">
                <CustomerCatalogues customerId={initialValues.id} token={token} />
              </FormCard>
            )}

            {/* Price list (edit mode only) */}
            {mode === 'edit' && initialValues && (
              <FormCard title="Price list">
                <CustomerPriceList
                  customerId={initialValues.id}
                  token={token}
                  currentPriceListId={initialValues.priceListId}
                />
              </FormCard>
            )}

            {/* Delivery profile (edit mode only) */}
            {mode === 'edit' && initialValues && (
              <FormCard title="Delivery profile">
                <CustomerDeliveryProfile
                  customerId={initialValues.id}
                  token={token}
                  currentProfileId={initialValues.deliveryProfileId}
                  currentProfileName={initialValues.deliveryProfile?.name ?? null}
                />
              </FormCard>
            )}

            {/* Portal access (edit mode only) */}
            {mode === 'edit' && (
              <FormCard title="Portal access">
                {inv ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted">Invitation</span>
                      <span
                        className="text-xs font-medium"
                        style={{ color: INVITE_STATUS_LABELS[inv.status].color }}
                      >
                        {INVITE_STATUS_LABELS[inv.status].label}
                      </span>
                    </div>
                    <p className="text-sm text-muted">
                      Sent to <span className="font-medium text-text">{inv.email}</span>
                    </p>
                    <p className="text-xs text-muted">
                      Expires {new Date(inv.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    {onInvite && (
                      <button
                        type="button"
                        onClick={handleInvite}
                        disabled={isInviting}
                        className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:opacity-50"
                      >
                        {isInviting ? 'Generating…' : 'Resend invitation'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted">No invitation has been sent yet.</p>
                    {onInvite && initialValues?.organisation.email && (
                      <button
                        type="button"
                        onClick={handleInvite}
                        disabled={isInviting}
                        className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:opacity-50"
                      >
                        {isInviting ? 'Generating…' : 'Send invitation'}
                      </button>
                    )}
                    {!initialValues?.organisation.email && (
                      <p className="text-xs text-muted">Add an email address to send an invitation.</p>
                    )}
                  </div>
                )}
              </FormCard>
            )}
          </div>

          {/* ── Right column — actions ── */}
          <div className="space-y-5">
            {/* Save / Discard */}
            <FormCard>
              <div className="space-y-2">
                {apiError && (
                  <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {apiError}
                  </div>
                )}
                {!inviteUrl ? (
                  <>
                    <button
                      type="submit"
                      disabled={disabled}
                      className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
                    >
                      {isSubmitting ? 'Saving…' : mode === 'create' ? 'Save customer' : 'Save changes'}
                    </button>
                    <Link
                      href="/customers"
                      className="block w-full rounded-md px-4 py-2 text-center text-sm font-medium text-muted transition-colors hover:text-text"
                    >
                      Discard
                    </Link>
                  </>
                ) : (
                  <Link
                    href="/customers"
                    className="block w-full rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover"
                  >
                    Done
                  </Link>
                )}
              </div>
            </FormCard>

            {/* Order on behalf of (edit mode only) */}
            {mode === 'edit' && onOrderAs && (
              <FormCard>
                <button
                  type="button"
                  onClick={handleOrderAs}
                  disabled={isOrderingAs}
                  className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:opacity-50"
                >
                  {isOrderingAs ? 'Opening…' : 'Order on behalf of customer'}
                </button>
              </FormCard>
            )}

            {/* Danger zone (edit mode only) */}
            {mode === 'edit' && onDelete && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                {!deleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(true)}
                    className="w-full rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:border-red-400"
                  >
                    Remove customer
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-red-700">Are you sure? This cannot be undone.</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                      >
                        {isDeleting ? 'Removing…' : 'Yes, remove'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(false)}
                        className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </form>
    </>
  );
}
