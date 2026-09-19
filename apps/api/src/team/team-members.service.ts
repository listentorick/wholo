import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActorType, InvitationStatus, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateStaffRolesDto } from './dto/staff-roles.dto';
import { fullName } from './staff-invitations.service';
import { assertAssignableRoles, OWNER_ROLES } from './staff-roles';

export interface TeamMemberView {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  roles: Role[];
  joinedAt: string;
  /** Who invited them; null for people who were not invited (the Owner). */
  invitedBy: string | null;
}

interface MembershipRow {
  createdAt: Date;
  role: Role;
  roles: { role: Role }[];
  user: { id: string; firstName: string; lastName: string; email: string };
}

/** Same union the auth layer uses: MembershipRole rows plus the legacy scalar. */
function effectiveRoles(m: { role: Role; roles: { role: Role }[] }): Role[] {
  return [...new Set([...m.roles.map((r) => r.role), m.role])];
}

@Injectable()
export class TeamMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(distributorId: string): Promise<TeamMemberView[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { organisationId: distributorId, user: { deletedAt: null } },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } }, roles: true },
      orderBy: { createdAt: 'asc' },
    });
    const accepted = await this.prisma.staffInvitation.findMany({
      where: {
        distributorId,
        status: InvitationStatus.ACCEPTED,
        acceptedByUserId: { in: memberships.map((m) => m.userId) },
      },
      include: { invitedBy: { select: { firstName: true, lastName: true } } },
    });
    const invitedByUser = new Map(accepted.map((i) => [i.acceptedByUserId, fullName(i.invitedBy)]));
    return memberships.map((m) => this.toView(m, invitedByUser.get(m.user.id) ?? null));
  }

  async updateRoles(
    distributorId: string,
    userId: string,
    actorUserId: string,
    dto: UpdateStaffRolesDto,
  ): Promise<TeamMemberView> {
    if (userId === actorUserId) {
      throw new ForbiddenException('You can’t change your own roles.');
    }
    const roles = assertAssignableRoles(dto.roles);

    const membership = await this.prisma.membership.findFirst({
      where: { userId, organisationId: distributorId, user: { deletedAt: null } },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } }, roles: true },
    });
    if (!membership) throw new NotFoundException('Team member not found');

    const before = effectiveRoles(membership);
    if (before.some((r) => OWNER_ROLES.includes(r))) {
      throw new ForbiddenException('The Owner’s roles can’t be changed here.');
    }
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { firstName: true, lastName: true },
    });
    if (!actor) throw new NotFoundException('User not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      // The legacy `Membership.role` scalar is unioned into permission
      // resolution (JwtStrategy), so it must move with the role rows or a
      // stale value would silently keep granting the old role.
      await tx.membershipRole.deleteMany({ where: { membershipId: membership.id } });
      const row = await tx.membership.update({
        where: { id: membership.id },
        data: { role: roles[0], roles: { create: roles.map((role) => ({ role })) } },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } }, roles: true },
      });
      await this.audit.record(tx, {
        distributorId,
        entityType: 'MEMBERSHIP',
        entityId: membership.id,
        action: 'ROLES_UPDATED',
        actorType: ActorType.USER,
        actorUserId,
        actorName: fullName(actor),
        summary: `Changed the roles for ${fullName(membership.user)}`,
        changes: { userId, email: membership.user.email, from: before, to: roles },
      });
      return row;
    });
    return this.toView(updated, null);
  }

  /**
   * Removes a person from the team (ADR-067). One transaction:
   *  - snapshots who they were (email, name, roles) into the audit log, which
   *    has no foreign keys, so history survives;
   *  - deletes their Membership (and role rows), which is what revokes access
   *    — authorisation reads Membership on every request, so a still-valid JWT
   *    stops working on the next call;
   *  - if that was their ONLY membership: soft-deletes the User (kept, so
   *    orders/audit references stay intact, and their email stays taken) and
   *    queues the Keycloak disable so they can't sign in at all.
   * Someone who also belongs elsewhere only loses THIS membership.
   */
  async remove(distributorId: string, userId: string, actorUserId: string): Promise<void> {
    if (userId === actorUserId) {
      throw new ForbiddenException('You can\u2019t remove yourself from the team.');
    }
    const membership = await this.prisma.membership.findFirst({
      where: { userId, organisationId: distributorId, user: { deletedAt: null } },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, keycloakId: true } }, roles: true },
    });
    if (!membership) throw new NotFoundException('Team member not found');

    const roles = effectiveRoles(membership);
    if (roles.some((r) => OWNER_ROLES.includes(r))) {
      throw new ForbiddenException('The Owner can\u2019t be removed from here.');
    }
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { firstName: true, lastName: true },
    });
    if (!actor) throw new NotFoundException('User not found');

    await this.prisma.$transaction(async (tx) => {
      const otherMemberships = await tx.membership.count({ where: { userId, id: { not: membership.id } } });

      await this.audit.record(tx, {
        distributorId,
        entityType: 'MEMBERSHIP',
        entityId: membership.id,
        action: 'REMOVED',
        actorType: ActorType.USER,
        actorUserId,
        actorName: fullName(actor),
        summary: `Removed ${fullName(membership.user)} from the team`,
        changes: { userId, email: membership.user.email, name: fullName(membership.user), roles },
      });

      await tx.membershipRole.deleteMany({ where: { membershipId: membership.id } });
      await tx.membership.delete({ where: { id: membership.id } });

      if (otherMemberships === 0) {
        await tx.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
        await tx.refreshToken.deleteMany({ where: { userId } });
        if (membership.user.keycloakId) {
          await this.outbox.writeEvent(tx, 'User', userId, 'StaffKeycloakDisableRequested', {
            userId,
            keycloakId: membership.user.keycloakId,
            distributorId,
          });
        }
      }
    });
  }

  private toView(m: MembershipRow, invitedBy: string | null): TeamMemberView {
    return {
      userId: m.user.id,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      email: m.user.email,
      roles: effectiveRoles(m),
      joinedAt: m.createdAt.toISOString(),
      invitedBy,
    };
  }
}
