'use client';

import { useState } from 'react';
import { ApiError, adminTeamApi } from '@wholo/admin-api-client';
import type { Role, StaffInvitation } from '@wholo/types';
import { Modal } from '@/components/Modal';
import { FieldError } from '@/components/form/FieldError';
import { TextInput } from '@/components/form/TextInput';
import { RolePicker } from './RolePicker';

interface InviteTeamMemberModalProps {
  onClose: () => void;
  onInvited: (invitation: StaffInvitation) => void;
}

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export function InviteTeamMemberModal({ onClose, onInvited }: InviteTeamMemberModalProps) {
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [rolesError, setRolesError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    const nextEmailError = !trimmed
      ? 'Enter their email address.'
      : !EMAIL_PATTERN.test(trimmed)
        ? 'That doesn’t look like an email address.'
        : undefined;
    const nextRolesError = roles.length === 0 ? 'Choose at least one role.' : undefined;
    setEmailError(nextEmailError);
    setRolesError(nextRolesError);
    setFormError(null);
    if (nextEmailError || nextRolesError) return;

    setSubmitting(true);
    try {
      onInvited(await adminTeamApi.invite({ email: trimmed, roles }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setEmailError(err.message);
      else if (err instanceof ApiError && err.status === 400) setFormError(err.message);
      else setFormError('Couldn’t send the invitation. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="invite-team-title" closable={!submitting} size="md">
      <form onSubmit={submit} noValidate>
        <h3 id="invite-team-title" className="text-base font-semibold text-text">Invite a team member</h3>
        <p className="mt-1 text-sm text-muted">They&rsquo;ll get an email with a link to create their Stocdup account.</p>

        <label htmlFor="invite-team-email" className="mt-4 block text-sm font-medium text-text">Email</label>
        <div className="mt-1.5">
          <TextInput
            id="invite-team-email"
            type="email"
            autoComplete="off"
            placeholder="name@company.com"
            value={email}
            disabled={submitting}
            aria-invalid={!!emailError}
            aria-describedby="invite-team-email-hint"
            onChange={(e) => setEmail(e.target.value)}
            className={emailError ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}
          />
        </div>
        {emailError ? (
          <FieldError message={emailError} />
        ) : (
          <p id="invite-team-email-hint" className="mt-1.5 text-xs text-muted">They must sign up with this exact address, and verify it.</p>
        )}

        <p className="mt-5 text-sm font-medium text-text" id="invite-team-roles">Roles</p>
        <p className="mb-2 text-xs text-muted">Choose one or more.</p>
        <RolePicker idPrefix="invite-team-role" value={roles} onChange={setRoles} disabled={submitting} invalid={!!rolesError} />
        <FieldError message={rolesError} />

        {formError && <p role="alert" className="mt-3 text-sm text-red-600">{formError}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            data-modal-cancel
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-border/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Sending…' : 'Send invitation'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
