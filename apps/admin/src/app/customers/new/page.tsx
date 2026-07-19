'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { PageHeading } from '@/components/PageHeading';
import { CustomerSearchStep } from '@/components/customers/CustomerSearchStep';
import { CustomerConfirmStep } from '@/components/customers/CustomerConfirmStep';
import { AccountTab } from '@/components/customers/tabs/AccountTab';
import { DeliveryTab } from '@/components/customers/tabs/DeliveryTab';
import { CataloguePricingTab } from '@/components/customers/tabs/CataloguePricingTab';
import { PortalAccessTab } from '@/components/customers/tabs/PortalAccessTab';
import { adminCustomersApi } from '@wholo/admin-api-client';
import type { OrganisationSearchResult, Customer } from '@wholo/types';

type Step = 'search' | 'confirm' | 'create-new' | 'account' | 'delivery' | 'catalogue-pricing' | 'portal-access';

const INDICATOR_STEPS = ['search', 'account', 'delivery', 'catalogue-pricing', 'portal-access'] as const;

const INDICATOR_LABELS: Record<typeof INDICATOR_STEPS[number], string> = {
  search: 'Find business',
  account: 'Account',
  delivery: 'Delivery',
  'catalogue-pricing': 'Catalogue & Pricing',
  'portal-access': 'Portal Access',
};

function stepToIndicator(step: Step): typeof INDICATOR_STEPS[number] {
  if (step === 'search' || step === 'confirm' || step === 'create-new') return 'search';
  return step as typeof INDICATOR_STEPS[number];
}

function StepIndicator({ current }: { current: Step }) {
  const display = stepToIndicator(current);
  const currentIdx = INDICATOR_STEPS.indexOf(display);
  return (
    <div className="flex items-center gap-2 mb-5 overflow-x-auto">
      {INDICATOR_STEPS.map((step, idx) => (
        <div key={step} className="flex items-center gap-2 shrink-0">
          <span
            className={[
              'text-xs font-medium',
              idx < currentIdx ? 'text-primary' : idx === currentIdx ? 'text-text font-semibold' : 'text-muted',
            ].join(' ')}
          >
            {INDICATOR_LABELS[step]}
          </span>
          {idx < INDICATOR_STEPS.length - 1 && (
            <span className="text-border text-xs">›</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function NewCustomerPage() {
  const { isLoading } = useRequireAuth();
  const { accessToken } = useAuth();

  const [step, setStep] = useState<Step>('search');
  const [selectedOrg, setSelectedOrg] = useState<OrganisationSearchResult | null>(null);
  const [newBusinessName, setNewBusinessName] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isNewBusiness, setIsNewBusiness] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  // Create relationship for an existing org (found via search)
  async function handleSetUpExisting() {
    if (!accessToken || !selectedOrg) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      const result = await adminCustomersApi.create(accessToken, { organisationId: selectedOrg.id });
      setCustomer(result);
      setIsNewBusiness(false);
      setStep('account');
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Create a brand-new org + relationship (manual entry path)
  async function handleSetUpNew() {
    if (!accessToken || !newBusinessName.trim()) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      const result = await adminCustomersApi.create(accessToken, { name: newBusinessName.trim() });
      setCustomer(result);
      setIsNewBusiness(true);
      setStep('account');
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const accountBackStep: Step = isNewBusiness ? 'create-new' : 'confirm';

  return (
    <AdminLayout>
      <div className="mb-5 flex items-center gap-4">
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
        <PageHeading>Add customer</PageHeading>
      </div>

      <StepIndicator current={step} />

      <div className="rounded-lg border border-border bg-white">
        {step === 'search' && (
          <>
            <CustomerSearchStep
              token={accessToken ?? ''}
              selectedOrg={selectedOrg}
              onSelectOrg={setSelectedOrg}
              onCantFind={() => { setSelectedOrg(null); setStep('create-new'); }}
            />
            <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
              <Link
                href="/customers"
                className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text"
              >
                Discard
              </Link>
              <button
                type="button"
                disabled={selectedOrg === null}
                onClick={() => setStep('confirm')}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </>
        )}

        {step === 'create-new' && (
          <>
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold text-text">Add a new business</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label htmlFor="new-business-name" className="block text-xs font-semibold uppercase tracking-wide text-text mb-1.5">
                  Business name
                </label>
                <input
                  id="new-business-name"
                  type="text"
                  value={newBusinessName}
                  onChange={(e) => { setNewBusinessName(e.target.value); setApiError(null); }}
                  placeholder="The Rusty Anchor Bar & Grill"
                  autoFocus
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text placeholder-muted/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
              <p className="text-xs text-muted">
                This creates a new business record. You can add their full details in the next steps.
              </p>
              {apiError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {apiError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => { setStep('search'); setApiError(null); }}
                className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text"
              >
                ← Back
              </button>
              <button
                type="button"
                disabled={isSubmitting || !newBusinessName.trim()}
                onClick={handleSetUpNew}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {isSubmitting ? 'Setting up…' : 'Set up →'}
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && selectedOrg && (
          <>
            <CustomerConfirmStep org={selectedOrg} />
            {apiError && (
              <div className="mx-5 mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {apiError}
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => { setStep('search'); setApiError(null); }}
                className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text"
              >
                ← Back
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSetUpExisting}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {isSubmitting ? 'Setting up…' : 'Set up →'}
              </button>
            </div>
          </>
        )}

        {step === 'account' && customer && (
          <AccountTab
            customer={customer}
            token={accessToken ?? ''}
            mode="wizard"
            onNext={() => setStep('delivery')}
            onBack={() => setStep(accountBackStep)}
          />
        )}

        {step === 'delivery' && customer && (
          <DeliveryTab
            customer={customer}
            token={accessToken ?? ''}
            mode="wizard"
            onNext={() => setStep('catalogue-pricing')}
            onBack={() => setStep('account')}
          />
        )}

        {step === 'catalogue-pricing' && customer && (
          <CataloguePricingTab
            customer={customer}
            token={accessToken ?? ''}
            mode="wizard"
            onNext={() => setStep('portal-access')}
            onBack={() => setStep('delivery')}
          />
        )}

        {step === 'portal-access' && customer && (
          <PortalAccessTab
            customer={customer}
            token={accessToken ?? ''}
            mode="wizard"
            onBack={() => setStep('catalogue-pricing')}
          />
        )}
      </div>
    </AdminLayout>
  );
}
