'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { adminOnboardingApi, adminSettingsApi, ApiError } from '@wholo/admin-api-client';
import type { DistributorOrganisation, DistributorSettings, UpdateDistributorSettingsRequest } from '@wholo/types';
import { useAuth } from '@/lib/auth-context';
import { suggestSlug, SLUG_PATTERN } from '@/lib/slug';
import { FieldLabel, FieldError, TextInput } from '@/components/settings/shared';
import { AddressFields } from '@/components/onboarding/AddressFields';
import { BrandingTab } from '@/components/settings/tabs/BrandingTab';
import { OrdersTab } from '@/components/settings/tabs/OrdersTab';
import { PortalTab } from '@/components/settings/tabs/PortalTab';
import { NotificationsForm } from '@/components/settings/NotificationsForm';
import { DiscoverySettingsForm } from '@/components/settings/DiscoverySettingsForm';

const STEPS = ['business', 'branding', 'orders', 'portal', 'notifications', 'discovery'] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  business: 'Business',
  branding: 'Branding',
  orders: 'Orders',
  portal: 'Portal',
  notifications: 'Notifications',
  discovery: 'Discovery',
};

const STEP_TITLES: Record<Exclude<Step, 'business'>, { title: string; blurb: string }> = {
  branding: { title: 'Make it yours', blurb: 'Add your logo and banner — they appear on your customer portal. You can skip this and add them later in Settings.' },
  orders: { title: 'How you take orders', blurb: 'Choose how incoming orders are accepted and when you process them.' },
  portal: { title: 'Your portal’s About page', blurb: 'A tagline and short story shown to customers visiting your portal.' },
  notifications: { title: 'Order notifications', blurb: 'Who should hear about new orders the moment they land?' },
  discovery: { title: 'Get discovered', blurb: 'Choose whether trade customers can find you in the marketplace.' },
};

const businessSchema = z.object({
  name: z.string().trim().min(1, 'Business name is required').max(120, 'Keep the name under 120 characters'),
  slug: z
    .string()
    .trim()
    .min(1, 'Store URL is required')
    .max(60, 'Keep it under 60 characters')
    .regex(SLUG_PATTERN, 'Lowercase letters, numbers and hyphens only'),
  phone: z.string().max(30, 'Keep it under 30 characters').optional(),
  email: z.string().email('Enter a valid email').or(z.literal('')).optional(),
  addressLine1: z.string().trim().min(1, 'Address line 1 is required'),
  addressLine2: z.string().optional(),
  addressCity: z.string().trim().min(1, 'City is required'),
  addressState: z.string().optional(),
  addressPostcode: z.string().trim().min(1, 'Postcode is required'),
  addressCountry: z.string().trim().min(1, 'Country is required'),
});

type BusinessValues = z.infer<typeof businessSchema>;

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEPS.indexOf(current);
  return (
    <div className="mb-5 flex items-center gap-2 overflow-x-auto">
      {STEPS.map((step, idx) => (
        <div key={step} className="flex shrink-0 items-center gap-2">
          <span
            className={[
              'text-xs font-medium',
              idx < currentIdx ? 'text-primary' : idx === currentIdx ? 'font-semibold text-text' : 'text-muted',
            ].join(' ')}
          >
            {STEP_LABELS[step]}
          </span>
          {idx < STEPS.length - 1 && <span className="text-xs text-border">›</span>}
        </div>
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const { user, accessToken, isLoading, onboardingRequired, identity, refreshSession } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>('business');
  const [org, setOrg] = useState<DistributorOrganisation | null>(null);
  const [settings, setSettings] = useState<DistributorSettings | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const { register, handleSubmit, watch, setValue, setError, formState: { errors, isSubmitting } } =
    useForm<BusinessValues>({
      resolver: zodResolver(businessSchema),
      defaultValues: { slug: '', email: identity?.email ?? '', addressCountry: 'United Kingdom' },
    });

  const [slugEdited, setSlugEdited] = useState(false);
  const nameValue = watch('name');
  const slugValue = watch('slug');

  // Suggest the portal address from the business name until the person edits it.
  useEffect(() => {
    if (!slugEdited) setValue('slug', suggestSlug(nameValue ?? ''), { shouldValidate: false });
  }, [nameValue, slugEdited, setValue]);

  // Keep the email prefill in sync once the identity loads.
  useEffect(() => {
    if (identity?.email) setValue('email', identity.email);
  }, [identity?.email, setValue]);

  useEffect(() => {
    if (isLoading) return;
    // Arrived already onboarded (and not mid-wizard) → dashboard.
    if (user && !org) router.replace('/');
    // Not authenticated with Keycloak at all → normal login flow.
    else if (!accessToken && !onboardingRequired) router.replace('/login');
  }, [isLoading, user, org, accessToken, onboardingRequired, router]);

  async function createDistributor(values: BusinessValues) {
    if (!accessToken) return;
    setSubmitError(null);
    try {
      const created = await adminOnboardingApi.createDistributor(accessToken, {
        name: values.name,
        slug: values.slug,
        phone: values.phone || undefined,
        email: values.email || undefined,
        addressLine1: values.addressLine1,
        addressLine2: values.addressLine2 || undefined,
        addressCity: values.addressCity,
        addressState: values.addressState || undefined,
        addressPostcode: values.addressPostcode,
        addressCountry: values.addressCountry,
      });
      setOrg(created);
      // Now that the org exists, the settings row can be fetched (lazily created server-side).
      setSettings(await adminSettingsApi.get(accessToken));
      setStep('branding');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && /portal address/i.test(e.message)) {
        setError('slug', { message: e.message });
      } else {
        setSubmitError(
          e instanceof ApiError ? e.message : 'Something went wrong creating your distributorship. Please try again.',
        );
      }
    }
  }

  async function saveSettings(patch: UpdateDistributorSettingsRequest) {
    if (!accessToken) return;
    const updated = await adminSettingsApi.update(accessToken, patch);
    setSettings(updated);
  }

  async function finish() {
    setFinishing(true);
    await refreshSession();
    router.replace('/');
  }

  function goTo(target: Step) {
    setStep(target);
  }

  const stepIdx = STEPS.indexOf(step);
  const next = () => (step === 'discovery' ? finish() : goTo(STEPS[stepIdx + 1]));
  const back = () => goTo(STEPS[Math.max(1, stepIdx - 1)]);

  if (isLoading || finishing || (!onboardingRequired && !user && !org)) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  const meta = step !== 'business' ? STEP_TITLES[step] : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface lg:flex-row">
      {/* Navy panel — the same surface as the app's sidebar: the wizard
          previews the workspace anatomy the new distributor is about to enter. */}
      <aside className="flex shrink-0 flex-col justify-between bg-sidebar-bg px-8 py-8 lg:w-[380px] lg:px-10 lg:py-12">
        <div className="motion-safe:animate-[onboarding-enter_0.5s_ease-out]">
          <div className="inline-flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/stocdup-logo-only.png" alt="" className="h-8 w-8 shrink-0" />
            <span className="text-2xl font-bold leading-none tracking-[-0.03em] text-sidebar-fg">
              stocd<span className="text-primary">up</span>
            </span>
          </div>

          <h1 className="mt-10 text-3xl font-semibold leading-tight tracking-tight text-sidebar-fg lg:mt-16">
            {step === 'business'
              ? identity?.firstName
                ? `Welcome, ${identity.firstName}.`
                : 'Welcome.'
              : meta?.title}
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-sidebar-fg/70">
            {step === 'business'
              ? 'Your account is verified. Tell us about your business, and we’ll set up the workspace where you’ll manage your catalogue, customers and orders.'
              : meta?.blurb}
          </p>
        </div>

        <p className="mt-10 hidden text-xs text-sidebar-fg/40 lg:block">
          Signed in as {identity?.email ?? 'your new account'}
        </p>
      </aside>

      {/* Step content — this is the only scrollable region on desktop. */}
      <main className="flex-1 overflow-y-auto px-6 py-10 lg:px-12">
        <div className="mx-auto w-full max-w-2xl">
          <StepIndicator current={step} />

          <div className="rounded-lg border border-border bg-white">
            {step === 'business' && (
              <form onSubmit={handleSubmit(createDistributor)} noValidate>
                <div className="border-b border-border px-5 py-3.5">
                  <h2 className="text-sm font-semibold text-text">Business details</h2>
                </div>

                <div className="p-5">
                  {submitError && (
                    <div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {submitError}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <FieldLabel htmlFor="name">Business name</FieldLabel>
                      <TextInput id="name" placeholder="Acme Wine Co." {...register('name')} />
                      <FieldError message={errors.name?.message} />
                    </div>

                    <div>
                      <FieldLabel htmlFor="slug">Store URL</FieldLabel>
                      <TextInput
                        id="slug"
                        placeholder="acme-wine-co"
                        autoComplete="off"
                        {...register('slug', { onChange: () => setSlugEdited(true) })}
                      />
                      <FieldError message={errors.slug?.message} />
                      {slugValue && !errors.slug && (
                        <p className="mt-1.5 text-xs text-muted">
                          Your customers will order at <span className="font-mono">…/{slugValue}</span>
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <FieldLabel htmlFor="phone">Phone</FieldLabel>
                        <TextInput id="phone" type="tel" placeholder="0113 496 0000" {...register('phone')} />
                        <FieldError message={errors.phone?.message} />
                      </div>
                      <div>
                        <FieldLabel htmlFor="email">Business email</FieldLabel>
                        <TextInput id="email" type="email" {...register('email')} />
                        <FieldError message={errors.email?.message} />
                      </div>
                    </div>

                    <div className="pt-2">
                      <p className="mb-3 border-b border-border pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                        Business address
                      </p>
                      <AddressFields register={register} errors={errors} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? 'Creating your distributorship…' : 'Create your distributorship'}
                  </button>
                </div>
              </form>
            )}

            {step === 'branding' && org && accessToken && (
              <BrandingTab token={accessToken} distributorId={org.id} mode="wizard" onNext={next} />
            )}

            {step === 'orders' && settings && (
              <OrdersTab settings={settings} onSave={saveSettings} mode="wizard" onNext={next} onBack={back} />
            )}

            {step === 'portal' && settings && (
              <PortalTab settings={settings} onSave={saveSettings} mode="wizard" onNext={next} onBack={back} />
            )}

            {step === 'notifications' && settings && (
              <NotificationsForm settings={settings} onSave={saveSettings} mode="wizard" onNext={next} onBack={back} />
            )}

            {step === 'discovery' && settings && (
              <DiscoverySettingsForm
                settings={settings}
                onSave={saveSettings}
                mode="wizard"
                onNext={next}
                onBack={back}
                wizardNextLabel="Save & finish"
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
