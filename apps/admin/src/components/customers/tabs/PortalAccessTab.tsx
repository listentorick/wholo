'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Customer } from '@wholo/types';
import { InvitationStatus, TradeRelationshipStatus } from '@wholo/types';
import { adminCustomersApi } from '@wholo/admin-api-client';
import { FormCard, FieldLabel, TextInput } from './form-helpers';

const INVITE_STATUS_LABELS: Record<InvitationStatus, { label: string; color: string }> = {
  [InvitationStatus.PENDING]: { label: 'Pending', color: '#d97706' },
  [InvitationStatus.ACCEPTED]: { label: 'Accepted', color: '#16a34a' },
  [InvitationStatus.EXPIRED]: { label: 'Expired', color: '#6b7280' },
  [InvitationStatus.REVOKED]: { label: 'Revoked', color: '#6b7280' },
};

const STATUS_LABELS: Record<TradeRelationshipStatus, { label: string; bg: string; text: string }> = {
  [TradeRelationshipStatus.PENDING_INVITE]: { label: 'Pending invite', bg: '#fef9c3', text: '#a16207' },
  [TradeRelationshipStatus.PENDING_REQUEST]: { label: 'Pending request', bg: '#dbeafe', text: '#1d4ed8' },
  [TradeRelationshipStatus.ACTIVE]: { label: 'Active', bg: '#dcfce7', text: '#15803d' },
  [TradeRelationshipStatus.SUSPENDED]: { label: 'Suspended', bg: '#fee2e2', text: '#b91c1c' },
  [TradeRelationshipStatus.INACTIVE]: { label: 'Inactive', bg: '#f3f4f6', text: '#6b7280' },
};

interface Props {
  customer: Customer;
  token: string;
  mode: 'tab' | 'wizard';
  onSaved?: () => void;
  onBack?: () => void;
}

export function PortalAccessTab({ customer, token, mode, onSaved, onBack }: Props) {
  const router = useRouter();
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState(false);

  const inv = customer.latestInvitation;
  const orgEmail = customer.organisation.email;
  const statusMeta = STATUS_LABELS[customer.status];

  async function handleSendInvite() {
    if (!orgEmail) return;
    setIsInviting(true);
    setInviteError(null);
    try {
      await adminCustomersApi.invite(token, customer.id);
      setInviteSent(true);
      onSaved?.();
      if (mode === 'wizard') {
        router.push(`/customers/${customer.id}`);
      }
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invitation.');
    } finally {
      setIsInviting(false);
    }
  }

  function handleSkip() {
    router.push(`/customers/${customer.id}`);
  }

  if (mode === 'wizard') {
    return (
      <div>
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-text">Portal access</h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted">
            Send an invitation so this customer can log in to place orders, view invoices, and track deliveries.
          </p>

          {orgEmail ? (
            <div>
              <FieldLabel>Invitation email</FieldLabel>
              <TextInput value={orgEmail} disabled readOnly />
              <p className="mt-1.5 text-xs text-muted">
                The invitation will be sent to this address. Update it in the Overview tab if needed.
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No email on file. Add an email in the Overview tab before sending an invitation.
            </div>
          )}

          {inviteSent && (
            <p className="text-sm font-medium text-green-600">Invitation sent to {orgEmail}.</p>
          )}
          {inviteError && (
            <p className="text-sm font-medium text-red-500">{inviteError}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <button type="button" onClick={onBack} className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text">
            ← Back
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSkip}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={handleSendInvite}
              disabled={isInviting || !orgEmail || inviteSent}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {isInviting ? 'Sending…' : 'Send invitation →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Tab mode
  return (
    <div className="space-y-5">
      <FormCard title="Portal access">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Status</span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: statusMeta.bg, color: statusMeta.text }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusMeta.text }} />
              {statusMeta.label}
            </span>
          </div>

          {inv ? (
            <div className="space-y-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Invitation</span>
                <span
                  className="ml-3 text-xs font-medium"
                  style={{ color: INVITE_STATUS_LABELS[inv.status].color }}
                >
                  {INVITE_STATUS_LABELS[inv.status].label}
                </span>
              </div>
              <p className="text-sm text-muted">
                Sent to <span className="font-medium text-text">{inv.email}</span>
              </p>
              <p className="text-xs text-muted">
                Expires{' '}
                {new Date(inv.expiresAt).toLocaleDateString('en-AU', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
              {inviteSent && (
                <p className="text-xs font-medium text-green-600">New invitation sent.</p>
              )}
              {inviteError && (
                <p className="text-xs font-medium text-red-500">{inviteError}</p>
              )}
              {orgEmail && (
                <button
                  type="button"
                  onClick={handleSendInvite}
                  disabled={isInviting}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:opacity-50"
                >
                  {isInviting ? 'Sending…' : 'Resend invitation'}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted">No invitation has been sent yet.</p>
              {inviteSent && (
                <p className="text-xs font-medium text-green-600">Invitation sent to {orgEmail}.</p>
              )}
              {inviteError && (
                <p className="text-xs font-medium text-red-500">{inviteError}</p>
              )}
              {orgEmail ? (
                <button
                  type="button"
                  onClick={handleSendInvite}
                  disabled={isInviting || inviteSent}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
                >
                  {isInviting ? 'Sending…' : 'Send invitation'}
                </button>
              ) : (
                <p className="text-xs text-muted">
                  Add an email address in the Overview tab to send an invitation.
                </p>
              )}
            </div>
          )}
        </div>
      </FormCard>
    </div>
  );
}
