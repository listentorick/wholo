'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { useAuth } from '@/lib/auth-context';
import { AdminLayout } from '@/components/AdminLayout';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { CustomerSearchStep } from '@/components/customers/CustomerSearchStep';
import { CustomerConfirmStep } from '@/components/customers/CustomerConfirmStep';
import { adminCustomersApi } from '@wholo/admin-api-client';
import type { OrganisationSearchResult, CreateCustomerRequest } from '@wholo/types';

type Step = 'search' | 'confirm' | 'create-new';

export default function NewCustomerPage() {
  const { isLoading } = useRequireAuth();
  const { accessToken } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>('search');
  const [email, setEmail] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<OrganisationSearchResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [existingCustomerId, setExistingCustomerId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canAdvance = emailValid && selectedOrg !== null;

  async function handleSetUp() {
    if (!accessToken || !selectedOrg) return;
    setIsSubmitting(true);
    setApiError(null);
    setExistingCustomerId(null);
    try {
      const req: CreateCustomerRequest = {
        organisationId: selectedOrg.id,
        email,
      };
      const result = await adminCustomersApi.create(accessToken, req);
      router.push(`/customers/${result.id}/edit`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes('409') || err.message.toLowerCase().includes('already exists')) {
          // Try to find the existing customer to link to
          try {
            const list = await adminCustomersApi.list(accessToken, { limit: 100 });
            const found = list.data.find((c) => c.organisationId === selectedOrg.id);
            if (found) setExistingCustomerId(found.id);
          } catch {}
          setApiError('This customer already has a relationship with your account.');
        } else {
          setApiError(err.message);
        }
      } else {
        setApiError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateNew(data: CreateCustomerRequest) {
    if (!accessToken) return;
    const result = await adminCustomersApi.create(accessToken, { ...data, email: email || data.email });
    return { inviteUrl: (result as any).inviteUrl };
  }

  // "Create new" path — use existing CustomerForm
  if (step === 'create-new') {
    return (
      <AdminLayout>
        <CustomerForm
          mode="create"
          token={accessToken ?? ''}
          initialEmail={email}
          onSubmit={handleCreateNew}
        />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      {/* Page header */}
      <div className="mb-6 flex items-center gap-4">
        <Link href="/customers" className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Customers
        </Link>
        <span className="text-border">/</span>
        <h1 className="text-xl font-semibold text-text">Add customer</h1>
      </div>

      <div className="rounded-lg border border-border bg-white">
        {step === 'search' && (
          <CustomerSearchStep
            token={accessToken ?? ''}
            email={email}
            onEmailChange={setEmail}
            selectedOrg={selectedOrg}
            onSelectOrg={setSelectedOrg}
            onCantFind={() => setStep('create-new')}
          />
        )}

        {step === 'confirm' && selectedOrg && (
          <CustomerConfirmStep
            org={selectedOrg}
            existingCustomerId={existingCustomerId}
          />
        )}

        {apiError && (
          <div className="mx-5 mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {apiError}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
          {step === 'search' && (
            <>
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
            </>
          )}

          {step === 'confirm' && (
            <>
              <button
                type="button"
                onClick={() => { setStep('search'); setApiError(null); setExistingCustomerId(null); }}
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
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
