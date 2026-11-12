import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  GoneException,
} from '@nestjs/common';
import { InvitationStatus, Role, TradeRelationshipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { OutboxService } from '../outbox/outbox.service';
import { RELATIONSHIP_EVENTS, relationshipEventFields } from '../common/relationship-events';
import type { KeycloakIdentity } from '../auth/strategies/keycloak-identity.strategy';
import { InvitationCodesService, sameEmail } from '../invitation-codes/invitation-codes.service';

const invitationInclude = {
  tradeRelationship: {
    include: {
      distributor: { select: { id: true, slug: true, name: true, email: true, phone: true } },
      customer: { select: { name: true } },
    },
  },
} as const;

export interface PortalInvitationSummary {
  invitedEmail: string;
  distributorName: string;
  customerName: string;
  expiresAt: string;
}

@Injectable()
export class PortalInvitationsService {
  constructor(
    private prisma: PrismaService,
    private users: UsersService,
    private outbox: OutboxService,
    private codes: InvitationCodesService,
  ) {}

  private async findOpen(token: string) {
    const invitation = await this.prisma.customerInvitation.findFirst({ where: { token }, include: invitationInclude });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new ConflictException('Invitation has already been accepted');
    }
    if (invitation.status !== InvitationStatus.PENDING || invitation.expiresAt < new Date()) {
      throw new GoneException('Invitation has expired');
    }
    return invitation;
  }

  /**
   * What the accept page shows before anyone signs in (ADR-081): the invited
   * address (passed to Keycloak as login_hint) and who the invitation is from.
   * The token holder already has the address: the link came in an email to it.
   */
  async lookup(token: string): Promise<PortalInvitationSummary> {
    const invitation = await this.findOpen(token);
    return {
      invitedEmail: invitation.email,
      distributorName: invitation.tradeRelationship.distributor.name,
      customerName: invitation.tradeRelationship.customer.name,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /** Emails a code to the invited address so a login with another address can accept (ADR-081). */
  async sendCode(identity: KeycloakIdentity, token: string) {
    const invitation = await this.findOpen(token);
    return this.codes.send({
      kind: 'CUSTOMER',
      invitationId: invitation.id,
      invitedEmail: invitation.email,
      claimant: { sub: identity.sub, email: identity.email },
      businessName: invitation.tradeRelationship.customer.name,
      inviterName: invitation.tradeRelationship.distributor.name,
    });
  }

  async acceptInvite(identity: KeycloakIdentity, token: string, code?: string) {
    const invitation = await this.findOpen(token);

    // Bound to the invited address: either the verified login IS that address,
    // or whoever reads that mailbox approved this login with a code (ADR-081).
    let claimId: string | null = null;
    if (!sameEmail(identity.email, invitation.email)) {
      if (!code) throw new ForbiddenException('This invitation was sent to a different email address');
      claimId = await this.codes.check({ kind: 'CUSTOMER', invitationId: invitation.id, sub: identity.sub, code });
    }

    const rel = invitation.tradeRelationship;

    const user = await this.users.findOrCreateFromKeycloak(
      identity.sub,
      identity.email,
      identity.given_name ?? '',
      identity.family_name ?? '',
    );

    await this.prisma.$transaction(async (tx) => {
      if (claimId) await this.codes.consume(tx, claimId);
      await tx.membership.upsert({
        where: { userId_organisationId: { userId: user.id, organisationId: rel.customerId } },
        create: {
          userId: user.id,
          organisationId: rel.customerId,
          role: Role.TRADE_CUSTOMER,
          roles: { create: { role: Role.TRADE_CUSTOMER } },
        },
        update: {},
      });
      const acceptedAt = new Date();
      // Compare-and-set: of two simultaneous accepts, only one flips PENDING -> ACCEPTED.
      const claimed = await tx.customerInvitation.updateMany({
        where: { id: invitation.id, status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.ACCEPTED, acceptedAt, acceptedByUserId: user.id },
      });
      if (claimed.count === 0) throw new ConflictException('Invitation has already been accepted');
      // Read inside the transaction so the event records the status actually
      // being left — an invite can be accepted on an already-active relationship
      // (an extra user joining), which is not a new activation.
      const before = await tx.tradeRelationship.findUniqueOrThrow({
        where: { id: rel.id },
        select: { id: true, distributorId: true, customerId: true, status: true },
      });
      await tx.tradeRelationship.update({
        where: { id: rel.id },
        data: { status: TradeRelationshipStatus.ACTIVE },
      });
      await this.outbox.writeEvent(tx, 'TradeRelationship', rel.id, RELATIONSHIP_EVENTS.inviteAccepted, {
        ...relationshipEventFields(before, before.status, TradeRelationshipStatus.ACTIVE, acceptedAt),
        invitationId: invitation.id,
        // For the acceptance notice to the invited address (ADR-081).
        invitationEmail: invitation.email,
        acceptedByName: `${user.firstName} ${user.lastName}`.trim(),
        acceptedByEmail: user.email,
        acceptedWithCode: claimId !== null,
        customerName: rel.customer.name,
        distributorName: rel.distributor.name,
        distributorEmail: rel.distributor.email,
        distributorPhone: rel.distributor.phone,
      });
    });

    return { distributorSlug: rel.distributor.slug };
  }
}
