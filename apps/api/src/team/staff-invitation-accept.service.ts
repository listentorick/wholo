import { ConflictException, ForbiddenException, GoneException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ActorType, InvitationStatus, Prisma, Role } from '@prisma/client';
import { ROLE_LABELS, Role as SharedRole } from '@wholo/types';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { AuditService } from '../audit/audit.service';
import type { KeycloakIdentity } from '../auth/strategies/keycloak-identity.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { fullName, hashInvitationToken } from './staff-invitations.service';

export interface AcceptedStaffInvitation {
  distributorId: string;
  distributorName: string;
  roles: Role[];
}

@Injectable()
export class StaffInvitationAcceptService {
  private readonly logger = new Logger(StaffInvitationAcceptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly adminNotifications: AdminNotificationsService,
  ) {}

  /**
   * Accepts a staff invitation on behalf of an authenticated, email-verified
   * Keycloak identity (KeycloakIdentityGuard rejects unverified emails). The
   * invitation is bound to the address it was sent to: a verified identity
   * with a different address cannot claim it. Creates the Membership on the
   * inviting DISTRIBUTOR with every invited role.
   */
  async accept(identity: KeycloakIdentity, token: string): Promise<AcceptedStaffInvitation> {
    const invitation = await this.prisma.staffInvitation.findUnique({
      where: { tokenHash: hashInvitationToken(token) },
      include: { distributor: { select: { id: true, name: true } } },
    });

    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new ConflictException('This invitation has already been accepted');
    }
    if (invitation.status !== InvitationStatus.PENDING || invitation.expiresAt <= new Date()) {
      throw new GoneException('This invitation is no longer valid');
    }
    // Checked BEFORE any user row is created, so a wrong-address attempt
    // leaves no trace in our database.
    if (identity.email.trim().toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ForbiddenException('This invitation was sent to a different email address');
    }

    let user;
    try {
      user = await this.users.findOrCreateFromKeycloak(
        identity.sub,
        identity.email,
        identity.given_name ?? '',
        identity.family_name ?? '',
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('An account with this email already exists. Please sign in with it instead.');
      }
      throw e;
    }

    // One identity, one distributor; and a customer login can't double as staff.
    const existing = await this.prisma.membership.findFirst({ where: { userId: user.id }, select: { id: true } });
    if (existing) {
      throw new ConflictException('This account already belongs to a company, so it can’t accept this invitation.');
    }

    const roles = invitation.roles;
    await this.prisma.$transaction(async (tx) => {
      // Compare-and-set: of two simultaneous accepts of the same link, only
      // one flips PENDING -> ACCEPTED; the other rolls back here.
      const claimed = await tx.staffInvitation.updateMany({
        where: { id: invitation.id, status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date(), acceptedByUserId: user.id },
      });
      if (claimed.count === 0) {
        throw new ConflictException('This invitation has already been accepted');
      }

      // The legacy `role` scalar is still required on Membership (ADR-066);
      // it carries the first role, the MembershipRole rows carry them all.
      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          organisationId: invitation.distributorId,
          role: roles[0],
          roles: { create: roles.map((role) => ({ role })) },
        },
      });

      await this.audit.record(tx, {
        distributorId: invitation.distributorId,
        entityType: 'MEMBERSHIP',
        entityId: membership.id,
        action: 'ACCEPTED',
        actorType: ActorType.USER,
        actorUserId: user.id,
        actorName: fullName(user),
        summary: `${fullName(user)} accepted the invitation and joined the team`,
        changes: { userId: user.id, email: user.email, roles, invitationId: invitation.id },
      });
    });

    // ADR-055: written after the triggering transaction commits, as the last
    // step. A failure here must not undo or fail an accept that has already
    // happened — the person IS on the team; the Owner just misses a ping.
    try {
      await this.adminNotifications.notifyOrganisationAdmins(invitation.distributorId, {
        type: 'STAFF_INVITE_ACCEPTED',
        title: `${fullName(user)} joined your team`,
        body: `Accepted your invitation and can now sign in as ${roles.map((r) => ROLE_LABELS[r as unknown as SharedRole] ?? r).join(' and ')}.`,
        linkPath: '/team',
        payload: { userId: user.id, invitationId: invitation.id },
      });
    } catch (err) {
      this.logger.warn(`Could not notify admins that ${user.id} joined ${invitation.distributorId}: ${(err as Error).message}`);
    }

    return { distributorId: invitation.distributorId, distributorName: invitation.distributor.name, roles };
  }
}
