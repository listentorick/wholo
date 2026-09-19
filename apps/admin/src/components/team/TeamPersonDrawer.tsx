'use client';

import { useState } from 'react';
import { ApiError, adminTeamApi } from '@wholo/admin-api-client';
import type { Role } from '@wholo/types';
import { Drawer } from '@/components/Drawer';
import { SaveBanner } from '@/components/form/SaveBanner';
import { SaveButton } from '@/components/form/SaveButton';
import { StatusBadge } from '@/components/list/StatusBadge';
import { useAuth } from '@/lib/auth-context';
import {
  entryRoles, entryStatus, entryTitle, expiryText, formatDate, formatLongDate, sameRoleSet, type TeamEntry,
} from '@/lib/team';
import { RoleChips } from './RoleChip';
import { RolePicker } from './RolePicker';
import { TeamAvatar } from './TeamAvatar';
import { TeamConfirmDialog } from './TeamConfirmDialog';

interface TeamPersonDrawerProps {
  entry: TeamEntry;
  onClose: () => void;
  /** Called after any successful change so the page can reload the team. */
  onChanged: () => void;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2.5 text-[13px] first:border-t">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-text">{value}</dd>
    </div>
  );
}

/**
 * One drawer for members and invitations — every per-person action lives here
 * (there is no row menu). Mount with `key={entry.id}` so switching person
 * resets the edit state.
 */
export function TeamPersonDrawer({ entry, onClose, onChanged }: TeamPersonDrawerProps) {
  const { user } = useAuth();
  const current = entryRoles(entry);
  const [roles, setRoles] = useState<Role[]>(current);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [confirm, setConfirm] = useState<'remove' | 'revoke' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const { primary } = entryTitle(entry);
  const status = entryStatus(entry);
  const isMember = entry.kind === 'member';
  const firstName = isMember ? entry.member.firstName || primary : '';
  const isExpired = entry.kind === 'invitation' && entry.invitation.status === 'EXPIRED';
  const readOnlyReason: string | null = isMember
    ? entry.isOwner
      ? 'The Owner’s roles can’t be changed here.'
      : entry.isSelf
        ? 'You can’t change your own roles.'
        : null
    : isExpired
      ? 'This invitation has expired. Resend it to send a fresh link — you can change the roles once it’s pending again.'
      : null;
  const canRemove = isMember && !entry.isOwner && !entry.isSelf;

  const dirty = !sameRoleSet(roles, current);
  const noRoles = roles.length === 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || noRoles) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      if (entry.kind === 'member') await adminTeamApi.updateMemberRoles(entry.member.userId, { roles });
      else await adminTeamApi.updateInvitationRoles(entry.invitation.id, { roles });
      setSaved(true);
      onChanged();
    } catch (err) {
      setError(errorText(err, 'Couldn’t save the roles. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function resend() {
    if (entry.kind !== 'invitation') return;
    setResending(true);
    setError(null);
    try {
      await adminTeamApi.resendInvitation(entry.invitation.id);
      onChanged();
      onClose(); // a resend replaces the invitation, so this row is gone
    } catch (err) {
      setError(errorText(err, 'Couldn’t resend the invitation. Try again.'));
      setResending(false);
    }
  }

  async function runConfirmed() {
    setConfirming(true);
    setConfirmError(null);
    try {
      if (entry.kind === 'member') await adminTeamApi.removeMember(entry.member.userId);
      else await adminTeamApi.revokeInvitation(entry.invitation.id);
      onChanged();
      onClose();
    } catch (err) {
      setConfirmError(errorText(err, 'Something went wrong. Try again.'));
      setConfirming(false);
    }
  }

  return (
    <Drawer onClose={onClose} width={440}>
      <form onSubmit={save} className="flex min-h-full flex-col">
        <header className="flex items-start gap-3 border-b border-border px-6 py-5">
          <TeamAvatar entry={entry} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-base font-semibold text-text">{primary}</h2>
            <p className="mb-2 mt-0.5 break-words text-[13px] text-muted">{isMember ? entry.member.email : 'Invitation'}</p>
            <StatusBadge label={status.label} tone={status.tone} />
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:text-text">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </header>

        <div className="flex-1 space-y-6 px-6 py-6">
          {entry.kind === 'invitation' && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text">Invitation</h3>
              <dl>
                <KeyValue label="Email" value={entry.invitation.email} />
                <KeyValue label="Invited by" value={entry.invitation.invitedBy.name} />
                <KeyValue label="Sent" value={formatLongDate(entry.invitation.createdAt)} />
                <KeyValue label="Expires" value={`${formatLongDate(entry.invitation.expiresAt)} (${expiryText(entry.invitation.expiresAt).replace(/^Expires /, '').replace(/^Expired /, '')})`} />
              </dl>
              <p className="mt-2.5 text-xs text-muted">
                Invitations only work for the address they were sent to. To use a different address, revoke this one and send a new invitation.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={resend}
                  disabled={resending}
                  className="rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resending ? 'Resending…' : 'Resend invitation'}
                </button>
                <span className="text-xs text-muted">Sends a fresh link and restarts the 7 days.</span>
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text">Roles</h3>
            {readOnlyReason ? (
              <>
                <div className="mb-3"><RoleChips roles={current} /></div>
                <p className="text-xs leading-relaxed text-muted">{readOnlyReason}</p>
              </>
            ) : (
              <>
                <p className="mb-3 text-xs leading-relaxed text-muted">
                  {isMember
                    ? `Choose everything ${firstName} can do. Changes apply the next time they load a page.`
                    : 'They get these when they accept. You can change them until then.'}
                </p>
                <RolePicker idPrefix="team-drawer-role" value={roles} onChange={(r) => { setRoles(r); setSaved(false); }} disabled={saving} invalid={noRoles} />
                {noRoles && (
                  <p role="alert" className="mt-1.5 text-xs text-red-500">
                    {isMember
                      ? `Choose at least one role. To take away all access, remove ${firstName} from the team instead.`
                      : 'Choose at least one role. To cancel the invitation, revoke it instead.'}
                  </p>
                )}
              </>
            )}
            <div className="mt-2"><SaveBanner success={saved && !dirty} error={error} /></div>
          </section>

          {isMember && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text">Details</h3>
              <dl>
                <KeyValue label="Joined" value={formatDate(entry.member.joinedAt)} />
                {entry.member.invitedBy && <KeyValue label="Invited by" value={entry.member.invitedBy} />}
              </dl>
            </section>
          )}
        </div>

        <footer className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-white px-6 py-4">
          {canRemove && (
            <button type="button" onClick={() => { setConfirmError(null); setConfirm('remove'); }} className="whitespace-nowrap text-sm font-medium text-red-600 hover:underline">
              Remove from team
            </button>
          )}
          {entry.kind === 'invitation' && (
            <button type="button" onClick={() => { setConfirmError(null); setConfirm('revoke'); }} className="whitespace-nowrap text-sm font-medium text-red-600 hover:underline">
              Revoke invitation
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20">
              {readOnlyReason ? 'Close' : 'Cancel'}
            </button>
            {!readOnlyReason && <SaveButton isSubmitting={saving} disabled={!dirty || noRoles} />}
          </div>
        </footer>
      </form>

      {confirm === 'remove' && entry.kind === 'member' && (
        <TeamConfirmDialog
          title={`Remove ${primary} from the team?`}
          description={`${firstName} will be signed out and can no longer sign in to Stocdup or see anything for ${user?.organisationName ?? 'your company'}.`}
          note={<><strong className="font-semibold text-text">What stays:</strong> {firstName}&rsquo;s past orders, deliveries and activity remain on record with their name. To give them access again, send a new invitation.</>}
          confirmLabel="Remove from team"
          busyLabel="Removing…"
          submitting={confirming}
          error={confirmError}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirmed}
        />
      )}
      {confirm === 'revoke' && entry.kind === 'invitation' && (
        <TeamConfirmDialog
          title={`Revoke the invitation for ${entry.invitation.email}?`}
          description="The link in the email stops working. You can send a new invitation any time."
          confirmLabel="Revoke invitation"
          busyLabel="Revoking…"
          submitting={confirming}
          error={confirmError}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirmed}
        />
      )}
    </Drawer>
  );
}
