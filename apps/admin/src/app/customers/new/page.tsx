'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { CustomerSearchStep } from '@/components/customers/CustomerSearchStep';
import { CustomerConfirmStep } from '@/components/customers/CustomerConfirmStep';
import { AccountTab } from '@/components/customers/tabs/AccountTab';
import { DeliveryTab } from '@/components/customers/tabs/DeliveryTab';
import { CataloguePricingTab } from '@/components/customers/tabs/CataloguePricingTab';
import { PortalAccessTab } from '@/components/customers/tabs/PortalAccessTab';
import { adminCustomersApi } from '@wholo/admin-api-client';
import type { OrganisationSearchResult, Customer } from '@wholo/types';

type Step = 'search' | 'confirm' | 'account' | 'delivery' | 'catalogue-pricing' | 'portal-access';

const STEP_LABELS: Record<Step, string> = {
  search: 'Find business',
  confirm: 'Confirm',
  account: 'Account',
  delivery: 'Delivery',
  'catalogue-pricing': 'Catalogue & Pricing',
  'portal-access': 'Portal Access',
};

const ORDERED_STEPS: Step[] = ['search', 'confirm', 'account', 'delivery', 'catalogue-pricing', 'portal-access'];

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = ORDERED_STEPS.indexOf(current);
  return (
    <div className="flex items-center gap-2 mb-5 overflow-x-auto">
      {ORDERED_STEPS.map((step, idx) => (
        <div key={step} className="flex items-center gap-2 shrink-0">
          <span
            className={[
              'text-xs font-medium',
              idx < currentIdx ? 'text-primary' : idx === currentIdx ? 'text-text font-semibold' : 'text-muted',
            ].join(' ')}
          >
            {STEP_LABELS[step]}
          </span>
          {idx < ORDERED_STEPS.length - 1 && (
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
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  const canAdvance = selectedOrg !== null;

  async function handleSetUp() {
    if (!accessToken || !selectedOrg) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      const result = await adminCustomersApi.create(accessToken, {
        organisationId: selectedOrg.id,
      });
      setCustomer(result);
      setStep('account');
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AdminLayout>
      {/* Page header */}
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
        <h1 className="text-xl font-semibold text-text">Add customer</h1>
      </div>

      <StepIndicator current={step} />

      <div className="rounded-lg border border-border bg-white">
        {step === 'search' && (
          <>
            <CustomerSearchStep
              token={accessToken ?? ''}
              selectedOrg={selectedOrg}
              onSelectOrg={setSelectedOrg}
              onCantFind={() => {/* not supported in new wizard */}}
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
                disabled={!canAdvance}
                onClick={() => setStep('confirm')}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
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
                onClick={handleSetUp}
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
            onBack={() => setStep('confirm')}
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
