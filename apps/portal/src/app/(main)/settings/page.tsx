'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRequireAuth } from '@/lib/hooks/use-require-auth';
import { portalApi } from '@wholo/api-client';
import type { MyProfileResponse } from '@wholo/types';

const schema = z.object({
  name: z.string().min(1, 'Business name is required'),
  legalName: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  billingLine1: z.string().optional(),
  billingLine2: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingPostcode: z.string().optional(),
  billingCountry: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const TABS = ['Business'] as const;
type Tab = (typeof TABS)[number];

const inputBase = 'w-full border bg-white px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent';
const inputNormal = `${inputBase} border-border`;
const inputError  = `${inputBase} border-error focus:ring-error focus:border-error`;
const labelClass  = 'block text-xs font-semibold text-foreground-secondary mb-1.5';

export default function SettingsPage() {
  const { accessToken, isLoading: authLoading } = useRequireAuth('/settings');

  const [activeTab, setActiveTab] = useState<Tab>('Business');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<'success' | 'error' | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '', legalName: '', email: '', phone: '',
      billingLine1: '', billingLine2: '', billingCity: '',
      billingState: '', billingPostcode: '', billingCountry: '',
    },
  });

  useEffect(() => {
    if (authLoading || !accessToken) return;
    portalApi.getMyProfile(accessToken).then((profile: MyProfileResponse) => {
      reset({
        name: profile.name ?? '',
        legalName: profile.legalName ?? '',
        email: profile.email ?? '',
        phone: profile.phone ?? '',
        billingLine1: profile.billingLine1 ?? '',
        billingLine2: profile.billingLine2 ?? '',
        billingCity: profile.billingCity ?? '',
        billingState: profile.billingState ?? '',
        billingPostcode: profile.billingPostcode ?? '',
        billingCountry: profile.billingCountry ?? '',
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [authLoading, accessToken, reset]);

  async function onSubmit(values: FormValues) {
    if (!accessToken) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const body: Partial<MyProfileResponse> = {
        name: values.name,
        legalName: values.legalName || null,
        email: values.email || null,
        phone: values.phone || null,
        billingLine1: values.billingLine1 || null,
        billingLine2: values.billingLine2 || null,
        billingCity: values.billingCity || null,
        billingState: values.billingState || null,
        billingPostcode: values.billingPostcode || null,
        billingCountry: values.billingCountry || null,
      };
      await portalApi.updateMyProfile(accessToken, body);
      setSaveResult('success');
    } catch {
      setSaveResult('error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Tab bar */}
      <nav className="sticky top-14 z-10 bg-white border-b border-border overflow-x-auto">
        <div className="flex whitespace-nowrap">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={[
                'inline-flex items-center px-5 py-3 text-sm font-medium border-b-[3px] transition-colors',
                activeTab === tab
                  ? 'text-foreground border-accent'
                  : 'text-muted border-transparent hover:text-foreground',
              ].join(' ')}
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>

      <div className="w-full pb-10">
        {activeTab === 'Business' && (
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            {loading ? (
              <div className="px-4 md:px-6 py-8 flex flex-col gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-10 bg-surface-hover animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-10 px-4 md:px-6 pt-6 pb-2">
                {/* Left column: identity */}
                <div className="flex flex-col gap-4 pb-6 md:pb-0">
                  <div>
                    <label className={labelClass}>Business name</label>
                    <input
                      {...register('name')}
                      className={errors.name ? inputError : inputNormal}
                      placeholder="Your trading name"
                      autoComplete="organization"
                    />
                    {errors.name && (
                      <p className="mt-1 text-xs text-error">{errors.name.message}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Legal entity name</label>
                    <input
                      {...register('legalName')}
                      className={inputNormal}
                      placeholder="Registered legal name (if different)"
                      autoComplete="organization"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Email</label>
                    <input
                      {...register('email')}
                      type="email"
                      className={errors.email ? inputError : inputNormal}
                      placeholder="contact@yourbusiness.com"
                      autoComplete="email"
                    />
                    {errors.email && (
                      <p className="mt-1 text-xs text-error">{errors.email.message}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input
                      {...register('phone')}
                      type="tel"
                      className={inputNormal}
                      placeholder="+61 4xx xxx xxx"
                      autoComplete="tel"
                    />
                  </div>
                </div>

                {/* Right column: billing address */}
                <div className="flex flex-col gap-4 border-t border-border pt-6 md:border-t-0 md:pt-0">
                  <p className={labelClass}>Billing Address</p>
                  <div>
                    <label className={labelClass}>Line 1</label>
                    <input {...register('billingLine1')} className={inputNormal} placeholder="Street address" autoComplete="address-line1" />
                  </div>
                  <div>
                    <label className={labelClass}>Line 2</label>
                    <input {...register('billingLine2')} className={inputNormal} placeholder="Suite, floor, etc." autoComplete="address-line2" />
                  </div>
                  <div className="grid grid-cols-2 gap-x-4">
                    <div>
                      <label className={labelClass}>City</label>
                      <input {...register('billingCity')} className={inputNormal} placeholder="City" autoComplete="address-level2" />
                    </div>
                    <div>
                      <label className={labelClass}>State</label>
                      <input {...register('billingState')} className={inputNormal} placeholder="State" autoComplete="address-level1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4">
                    <div>
                      <label className={labelClass}>Postcode</label>
                      <input {...register('billingPostcode')} className={inputNormal} placeholder="Postcode" autoComplete="postal-code" />
                    </div>
                    <div>
                      <label className={labelClass}>Country</label>
                      <input {...register('billingCountry')} className={inputNormal} placeholder="Country" autoComplete="country-name" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Save bar */}
            {!loading && (
              <div className="px-4 md:px-6 pt-5 pb-2 flex items-center gap-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-accent text-white px-6 py-2.5 text-sm font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                {saveResult === 'success' && (
                  <span className="text-sm text-success">Saved</span>
                )}
                {saveResult === 'error' && (
                  <span className="text-sm text-error">Failed to save — please try again</span>
                )}
              </div>
            )}
          </form>
        )}
      </div>
    </>
  );
}
