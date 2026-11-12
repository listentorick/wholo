import { Injectable } from '@nestjs/common';
import type { AcceptedStaffInvitation, InvitationCodeSent, StaffInvitation, StaffInvitationSummary, SupportGrant, TeamMember, TeamOverview } from '@wholo/types';
import { ApiClientService } from '../api-client/api-client.service';
import { InviteTeamMemberDto, UpdateTeamRolesDto } from './dto/team.dto';

// Thin BFF over apps/api's team resources. The one shaping it does is
// `overview`: the Team page needs people and invitations together, so that is
// one round trip here rather than two from the browser.
@Injectable()
export class TeamService {
  constructor(private api: ApiClientService) {}

  async overview(distributorId: string, token: string): Promise<TeamOverview> {
    const [members, invitations] = await Promise.all([
      this.api.get<TeamMember[]>(`/distributors/${distributorId}/members`, token),
      this.api.get<StaffInvitation[]>(`/distributors/${distributorId}/staff-invitations`, token),
    ]);
    return { members, invitations };
  }

  invite(distributorId: string, dto: InviteTeamMemberDto, token: string) {
    return this.api.post<StaffInvitation>(`/distributors/${distributorId}/staff-invitations`, token, dto);
  }

  updateInvitationRoles(distributorId: string, invitationId: string, dto: UpdateTeamRolesDto, token: string) {
    return this.api.patch<StaffInvitation>(`/distributors/${distributorId}/staff-invitations/${invitationId}`, token, dto);
  }

  resendInvitation(distributorId: string, invitationId: string, token: string) {
    return this.api.post<StaffInvitation>(`/distributors/${distributorId}/staff-invitations/${invitationId}/resend`, token);
  }

  revokeInvitation(distributorId: string, invitationId: string, token: string) {
    return this.api.delete(`/distributors/${distributorId}/staff-invitations/${invitationId}`, token);
  }

  updateMemberRoles(distributorId: string, userId: string, dto: UpdateTeamRolesDto, token: string) {
    return this.api.patch<TeamMember>(`/distributors/${distributorId}/members/${userId}`, token, dto);
  }

  removeMember(distributorId: string, userId: string, token: string) {
    return this.api.delete(`/distributors/${distributorId}/members/${userId}`, token);
  }

  // Stocdup support access to this distributor (ADR-078): what is open now
  // (any member — it feeds the banner) or the full history (team managers).
  supportGrants(distributorId: string, activeOnly: boolean, token: string) {
    return this.api.get<SupportGrant[]>(`/distributors/${distributorId}/support-grants${activeOnly ? '?active=true' : ''}`, token);
  }

  endSupportGrant(distributorId: string, grantId: string, token: string) {
    return this.api.delete<SupportGrant>(`/distributors/${distributorId}/support-grants/${encodeURIComponent(grantId)}`, token);
  }

  // The invitee has no membership yet, so this is not scoped to a distributor:
  // apps/api resolves everything from the emailed token + the caller's identity.
  acceptInvitation(token: string, bearerToken: string, code?: string): Promise<AcceptedStaffInvitation> {
    return this.api.post<AcceptedStaffInvitation>('/staff-invitations/accept', bearerToken, { token, ...(code ? { code } : {}) });
  }

  // No sign-in: the invitee may not have an account yet (ADR-081).
  lookupInvitation(token: string): Promise<StaffInvitationSummary> {
    return this.api.post<StaffInvitationSummary>('/staff-invitations/lookup', '', { token });
  }

  sendInvitationCode(token: string, bearerToken: string): Promise<InvitationCodeSent> {
    return this.api.post<InvitationCodeSent>('/staff-invitations/email-code', bearerToken, { token });
  }
}
