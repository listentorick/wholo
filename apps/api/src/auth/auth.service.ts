import { ForbiddenException, Injectable } from '@nestjs/common';
import { OrganisationType, Role } from '@prisma/client';
import { Permission } from '@wholo/types';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_PERMISSIONS } from './role-permissions';
import { MembershipClaim } from './ops-session';

/** How the caller reaches the selected organisation (ADR-078). */
export type ProfileAccess =
  | { kind: 'MEMBER' }
  | { kind: 'SUPPORT'; grantId: string; expiresAt: Date };

interface ProfileOrganisation {
  id: string;
  name: string;
  type: OrganisationType;
  distributorSettings?: { currencyCode: string } | null;
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private prisma: PrismaService,
  ) {}

  /**
   * The caller's profile, scoped to one organisation. With no
   * `organisationId` it is one of the caller's own memberships: one of
   * `organisationType` when asked for (each app asks for the kind it serves —
   * the Ops app PLATFORM, the admin app DISTRIBUTOR), else a DISTRIBUTOR one
   * if any, else the first. The app then refuses a profile of the wrong kind.
   * With an `organisationId`, it must be an organisation the caller is a
   * member of, or holds an active support grant for in this request
   * (`memberships` is JwtStrategy's per-request resolution, which only carries
   * grants for an ops session) — anything else is refused: the id is a claim.
   */
  async getProfile(
    userId: string,
    options: { organisationId?: string; organisationType?: OrganisationType; memberships?: MembershipClaim[] } = {},
  ) {
    const user = await this.usersService.findById(userId);
    if (!user) return null;

    const base = { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName };

    if (options.organisationId) {
      const own = user.memberships.find((m) => m.organisationId === options.organisationId);
      if (own) return { ...base, ...this.scope(this.rolesOf(own), own.organisation, { kind: 'MEMBER' }) };

      const grant = options.memberships?.find((m) => m.organisationId === options.organisationId && m.supportGrantId);
      if (!grant?.supportGrantId || !grant.expiresAt) {
        throw new ForbiddenException('Not authorized for this organisation');
      }
      const organisation = await this.prisma.organisation.findUnique({
        where: { id: grant.organisationId },
        include: { distributorSettings: { select: { currencyCode: true } } },
      });
      if (!organisation) throw new ForbiddenException('Not authorized for this organisation');
      return {
        ...base,
        ...this.scope(grant.roles, organisation, { kind: 'SUPPORT', grantId: grant.supportGrantId, expiresAt: grant.expiresAt }),
      };
    }

    // Prefer the kind the app asked for, then a DISTRIBUTOR-side membership —
    // admin-api's JwtStrategy asserts organisationType to keep trade customers
    // off the admin surface (ADR-053), so this can't be an arbitrary "first
    // membership" pick. A user of several kinds (an operator who also works at
    // a wholesaler) gets the right one in each app.
    const ofType = (type: OrganisationType | undefined) => user.memberships.find((m) => m.organisation.type === type);
    const membership = ofType(options.organisationType) ?? ofType(OrganisationType.DISTRIBUTOR) ?? user.memberships[0];
    return { ...base, ...this.scope(membership ? this.rolesOf(membership) : [], membership?.organisation, { kind: 'MEMBER' }) };
  }

  // Union in the legacy scalar `role` as a live-rollout safety net — see
  // JwtStrategy.validate for the full rationale.
  private rolesOf(membership: { role: Role; roles: { role: Role }[] }): Role[] {
    return [...new Set([...membership.roles.map((r) => r.role), membership.role].filter(Boolean))];
  }

  private scope(roles: Role[], organisation: ProfileOrganisation | undefined, access: ProfileAccess) {
    const permissions = Array.from(new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? []))) as Permission[];
    return {
      roles,
      permissions,
      organisationId: organisation?.id,
      organisationName: organisation?.name,
      organisationType: organisation?.type,
      organisationCurrencyCode: organisation?.distributorSettings?.currencyCode,
      access,
    };
  }
}
