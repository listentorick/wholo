import type {
  AcceptedStaffInvitation,
  InviteTeamMemberRequest,
  StaffInvitation,
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

  /** Accept the emailed invitation as the signed-in, email-verified user. */
  acceptInvitation(token: string): Promise<AcceptedStaffInvitation> {
    return apiFetch<AcceptedStaffInvitation>('/api/v1/invitations/accept', { method: 'POST', body: JSON.stringify({ token }) });
  },
};
