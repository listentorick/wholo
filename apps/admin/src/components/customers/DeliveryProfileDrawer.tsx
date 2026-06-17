'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Drawer } from '@/components/Drawer';
import { useAuth } from '@/lib/auth-context';
import { adminDeliveryProfilesApi } from '@wholo/admin-api-client';
import type { DeliveryProfile } from '@wholo/types';

const WEEKDAYS = [
  { value: 0, short: 'Sun' },
  { value: 1, short: 'Mon' },
  { value: 2, short: 'Tue' },
  { value: 3, short: 'Wed' },
  { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' },
  { value: 6, short: 'Sat' },
];

interface Props {
  deliveryProfileId: string;
  onClose: () => void;
}

export function DeliveryProfileDrawer({ deliveryProfileId, onClose }: Props) {
  const { accessToken } = useAuth();
  const [profile, setProfile] = useState<DeliveryProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    adminDeliveryProfilesApi.get(accessToken, deliveryProfileId)
      .then(setProfile)
      .catch(() => setError('Failed to load delivery profile.'))
      .finally(() => setLoading(false));
  }, [accessToken, deliveryProfileId]);

  return (
    <Drawer onClose={onClose} width={480}>
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : profile ? (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text">{profile.name}</h2>
                <span
                  className={[
                    'mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                    profile.active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500',
                  ].join(' ')}
                >
                  <span className={['h-1.5 w-1.5 rounded-full', profile.active ? 'bg-green-600' : 'bg-gray-400'].join(' ')} />
                  {profile.active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            {/* Default delivery days */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Default delivery days</p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map(({ value, short }) => (
                  <span
                    key={value}
                    className={[
                      'rounded-md border px-2.5 py-1 text-xs font-medium',
                      profile.defaultWeekdays.includes(value)
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-surface text-muted opacity-40',
                    ].join(' ')}
                  >
                    {short}
                  </span>
                ))}
              </div>
            </div>

            {/* Default cut-off */}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Default cut-off</p>
              <p className="text-sm text-text">
                Order by <span className="font-medium">{profile.defaultCutoffTime}</span>,{' '}
                <span className="font-medium">{profile.defaultCutoffProcessingDays}</span> processing day{profile.defaultCutoffProcessingDays !== 1 ? 's' : ''} before delivery
              </p>
            </div>

            {/* Per-day overrides */}
            {profile.cutoffRules.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Per-day cut-off overrides</p>
                <div className="space-y-1">
                  {profile.cutoffRules.map((rule) => {
                    const day = WEEKDAYS.find((w) => w.value === rule.weekday);
                    return (
                      <div key={rule.id} className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2">
                        <span className="text-sm font-medium text-text">{day?.short ?? rule.weekday}</span>
                        <span className="text-xs text-muted">
                          by {rule.cutoffTime}, {rule.processingDaysBeforeDelivery} day{rule.processingDaysBeforeDelivery !== 1 ? 's' : ''} before
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Date exceptions */}
            {(profile.speciallyEnabledDates.length > 0 || profile.speciallyDisabledDates.length > 0) && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Date exceptions</p>
                <p className="text-sm text-text">
                  {profile.speciallyEnabledDates.length > 0 && (
                    <span>{profile.speciallyEnabledDates.length} enabled</span>
                  )}
                  {profile.speciallyEnabledDates.length > 0 && profile.speciallyDisabledDates.length > 0 && (
                    <span className="text-muted"> · </span>
                  )}
                  {profile.speciallyDisabledDates.length > 0 && (
                    <span>{profile.speciallyDisabledDates.length} disabled</span>
                  )}
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-border pt-4">
              <Link
                href={`/delivery-profiles/${profile.id}/edit`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Edit profile →
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
