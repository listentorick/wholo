import type { InvitationCodeSent, PortalInvitationSummary } from '@wholo/types';
import { apiFetch } from './base';

export const invitationsApi = {
  /** Accept as the signed-in user; `code` when signed in with another address than the invited one (ADR-081). */
  accept(inviteToken: string, code?: string): Promise<{ distributorSlug: string | null }> {
    return apiFetch('/api/v1/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: inviteToken, ...(code ? { code } : {}) }),
    });
  },

  /** The invited address and who sent it, before anyone signs in. */
  lookup(inviteToken: string): Promise<PortalInvitationSummary> {
    return apiFetch('/api/v1/invitations/lookup', {
      method: 'POST',
      body: JSON.stringify({ token: inviteToken }),
      anonymous: true,
    });
  },

  /** Email a one-time code to the invited address, for a login with another address. */
  sendCode(inviteToken: string): Promise<InvitationCodeSent> {
    return apiFetch('/api/v1/invitations/email-code', {
      method: 'POST',
      body: JSON.stringify({ token: inviteToken }),
    });
  },
};
