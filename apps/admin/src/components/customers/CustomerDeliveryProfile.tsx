'use client';

import { useState, useEffect } from 'react';
import { adminDeliveryProfilesApi } from '@wholo/admin-api-client';
import type { DeliveryProfileSummary } from '@wholo/types';

interface Props {
  customerId: string;
  token: string;
  currentProfileId: string | null;
  currentProfileName: string | null;
}

export function CustomerDeliveryProfile({ customerId, token, currentProfileId, currentProfileName }: Props) {
  const [profiles, setProfiles] = useState<DeliveryProfileSummary[]>([]);
  const [selected, setSelected] = useState<string>(currentProfileId ?? '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    adminDeliveryProfilesApi
      .list(token, { limit: 100 })
      .then((res) => setProfiles(res.data.filter((p) => p.active)))
      .catch(() => setLoadError(true));
  }, [token]);

  async function handleSave() {
    setSaving(true);
    setSuccess(false);
    setError(null);
    try {
      await adminDeliveryProfilesApi.assignToCustomer(token, customerId, {
        deliveryProfileId: selected || null,
      });
      setSuccess(true);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return <p className="text-sm text-muted">Could not load delivery profiles.</p>;
  }

  return (
    <div className="space-y-3">
      <select
        value={selected}
        onChange={(e) => { setSelected(e.target.value); setSuccess(false); }}
        className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      >
        <option value="">— No delivery profile —</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {success && <span className="text-xs font-medium text-green-600">Saved</span>}
        {error && <span className="text-xs font-medium text-red-500">{error}</span>}
      </div>

      {profiles.length === 0 && !loadError && (
        <p className="text-xs text-muted">No active delivery profiles found. <a href="/delivery-profiles/new" className="text-primary hover:underline">Create one</a>.</p>
      )}
    </div>
  );
}
