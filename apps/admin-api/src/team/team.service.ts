import { Injectable } from '@nestjs/common';
import type { AcceptedStaffInvitation, StaffInvitation, TeamMember, TeamOverview } from '@wholo/types';
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

  // The invitee has no membership yet, so this is not scoped to a distributor:
  // apps/api resolves everything from the emailed token + the caller's identity.
  acceptInvitation(token: string, bearerToken: string): Promise<AcceptedStaffInvitation> {
    return this.api.post<AcceptedStaffInvitation>('/staff-invitations/accept', bearerToken, { token });
  }
}
