import { Injectable } from '@nestjs/common';
import { OrganisationType } from '@prisma/client';
import { Permission } from '@wholo/types';
import { UsersService } from '../users/users.service';
import { ROLE_PERMISSIONS } from './role-permissions';

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {}

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) return null;
    // Prefer a DISTRIBUTOR-side membership when the user holds one — admin-api's
    // JwtStrategy asserts organisationType to keep trade customers off the admin
    // surface (ADR-053), so this can't be an arbitrary "first membership" pick.
    const membership =
      user.memberships.find((m) => m.organisation.type === OrganisationType.DISTRIBUTOR) ??
      user.memberships[0];

    // Union in the legacy scalar `role` as a live-rollout safety net — see
    // JwtStrategy.validate for the full rationale.
    const roles = [...new Set([...(membership?.roles.map((r) => r.role) ?? []), membership?.role].filter(Boolean))];
    const permissions = Array.from(
      new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? [])),
    ) as Permission[];

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      permissions,
      organisationId: membership?.organisationId,
      organisationName: membership?.organisation?.name,
      organisationType: membership?.organisation?.type,
      organisationCurrencyCode: membership?.organisation?.distributorSettings?.currencyCode,
    };
  }
}
