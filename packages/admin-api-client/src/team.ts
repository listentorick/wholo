import type {
  AcceptedStaffInvitation,
  InvitationCodeSent,
  InviteTeamMemberRequest,
  StaffInvitation,
  StaffInvitationSummary,
  SupportGrant,
  TeamMember,
  TeamOverview,
  UpdateTeamRolesRequest,
} from '@wholo/types';
import { apiFetch } from './base';

export const adminTeamApi = {
  overview(): Promise<TeamOverview> {
    return apiFetch<TeamOverview>('/api/v1/team');
  },

  invite(req: InviteTeamMemberRequest): Promise<StaffInvitation> {
    return apiFetch<StaffInvitation>('/api/v1/team/invitations', { method: 'POST', body: JSON.stringify(req) });
  },

  updateInvitationRoles(invitationId: string, req: UpdateTeamRolesRequest): Promise<StaffInvitation> {
    return apiFetch<StaffInvitation>(`/api/v1/team/invitations/${invitationId}`, { method: 'PATCH', body: JSON.stringify(req) });
  },

  resendInvitation(invitationId: string): Promise<StaffInvitation> {
    return apiFetch<StaffInvitation>(`/api/v1/team/invitations/${invitationId}/resend`, { method: 'POST' });
  },

  revokeInvitation(invitationId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/team/invitations/${invitationId}`, { method: 'DELETE' });
  },

  updateMemberRoles(userId: string, req: UpdateTeamRolesRequest): Promise<TeamMember> {
    return apiFetch<TeamMember>(`/api/v1/team/members/${userId}`, { method: 'PATCH', body: JSON.stringify(req) });
  },

  removeMember(userId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/team/members/${userId}`, { method: 'DELETE' });
  },

  /** Stocdup support access to this distributor (ADR-078): open now (any member), or the full history (team managers). */
  supportGrants(options: { activeOnly?: boolean } = {}): Promise<SupportGrant[]> {
    return apiFetch<SupportGrant[]>(`/api/v1/team/support-grants${options.activeOnly ? '?active=true' : ''}`);
  },

  endSupportGrant(grantId: string): Promise<SupportGrant> {
    return apiFetch<SupportGrant>(`/api/v1/team/support-grants/${encodeURIComponent(grantId)}`, { method: 'DELETE' });
  },

  /**
   * Accept the emailed invitation as the signed-in, email-verified user;
   * `code` when signed in with another address than the invited one (ADR-081).
   */
  acceptInvitation(token: string, code?: string): Promise<AcceptedStaffInvitation> {
    return apiFetch<AcceptedStaffInvitation>('/api/v1/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token, ...(code ? { code } : {}) }),
    });
  },

  /** The invited address and who sent it, before anyone signs in. */
  lookupInvitation(token: string): Promise<StaffInvitationSummary> {
    return apiFetch<StaffInvitationSummary>('/api/v1/invitations/lookup', {
      method: 'POST',
      body: JSON.stringify({ token }),
      anonymous: true,
    });
  },

  /** Email a one-time code to the invited address, for a login with another address. */
  sendInvitationCode(token: string): Promise<InvitationCodeSent> {
    return apiFetch<InvitationCodeSent>('/api/v1/invitations/email-code', { method: 'POST', body: JSON.stringify({ token }) });
  },
};
