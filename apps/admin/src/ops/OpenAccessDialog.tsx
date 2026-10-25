'use client';

import { useState } from 'react';
import { ApiError } from '@wholo/admin-api-client';
import { Modal } from '@/components/Modal';
import { opsApi } from './api';
import { enterWholesaler } from './navigation';
import { formatClock } from './time';

const DURATIONS = [
  { hours: 1, label: '1 hour' },
  { hours: 4, label: '4 hours' },
  { hours: 8, label: '8 hours' },
];

interface Props {
  distributor: { id: string; name: string };
  onClose: () => void;
  /** Injected for tests. */
  now?: () => Date;
}

/**
 * Open support access to one wholesaler (ADR-078): a reason is required, the
 * length is 1, 4 or 8 hours, and the Owner sees the visit. On success the tab
 * enters the wholesaler.
 */
export function OpenAccessDialog({ distributor, onClose, now = () => new Date() }: Props) {
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endsAt = new Date(now().getTime() + hours * 3600_000).toISOString();
  const canSubmit = reason.trim().length > 0 && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const grant = await opsApi.openAccess(distributor.id, reason.trim(), hours * 60);
      enterWholesaler(grant);
    } catch (err) {
      setError(err instanceof ApiError && err.problem.detail ? err.problem.detail : 'Couldn’t open access. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="open-access-title" closable={!submitting} size="md">
      <form onSubmit={submit}>
        <h3 id="open-access-title" className="text-base font-semibold text-text">
          Open {distributor.name}
        </h3>
        <p className="mt-1 text-sm text-muted">You will work in their account as yourself, with support access, until it ends.</p>

        <label htmlFor="open-access-reason" className="mt-5 block text-sm font-medium text-text">
          Why are you opening this account?
        </label>
        <textarea
          id="open-access-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={3}
          required
          placeholder="e.g. Setting up price lists, ticket 142"
          className="mt-1.5 w-full rounded-md border border-border px-3 py-2 text-sm text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
        <p className="mt-1 text-xs text-muted">The Owner sees this.</p>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-text">For how long?</legend>
          <div className="mt-1.5 flex gap-2">
            {DURATIONS.map((d) => (
              <label
                key={d.hours}
                className={`flex-1 cursor-pointer rounded-md border px-3 py-2 text-center text-sm font-medium transition-colors ${
                  hours === d.hours ? 'border-primary bg-primary/5 text-primary' : 'border-border text-text hover:bg-canvas'
                }`}
              >
                <input type="radio" name="duration" value={d.hours} checked={hours === d.hours} onChange={() => setHours(d.hours)} className="sr-only" />
                {d.label}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">Access ends at {formatClock(endsAt)}.</p>
        </fieldset>

        <div className="mt-5 grid gap-3 rounded-md border border-border bg-canvas p-3 text-xs leading-relaxed text-muted sm:grid-cols-2">
          <div>
            <p className="font-semibold text-text">You can</p>
            <p>Set up and change products, catalogues, price lists, customers, orders, deliveries and settings.</p>
          </div>
          <div>
            <p className="font-semibold text-text">You can’t</p>
            <p>Manage their team, connect or disconnect accounting, or order as a customer.</p>
          </div>
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            data-modal-cancel
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Opening…' : `Open ${distributor.name}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
