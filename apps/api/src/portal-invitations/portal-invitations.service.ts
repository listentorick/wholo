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

@Injectable()
export class PortalInvitationsService {
  constructor(
    private prisma: PrismaService,
    private users: UsersService,
    private outbox: OutboxService,
  ) {}

  async acceptInvite(identity: KeycloakIdentity, token: string) {
    const invitation = await this.prisma.customerInvitation.findFirst({
      where: { token },
      include: {
        tradeRelationship: {
          include: {
            distributor: { select: { id: true, slug: true, name: true } },
          },
        },
      },
    });

    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new ConflictException('Invitation has already been accepted');
    }
    if (invitation.status !== InvitationStatus.PENDING || invitation.expiresAt < new Date()) {
      throw new GoneException('Invitation has expired');
    }

    // Bind invitation to the specific email address it was sent to. A verified Keycloak
    // identity with a different address cannot claim someone else's invite token.
    if (identity.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ForbiddenException('This invitation was sent to a different email address');
    }

    const rel = invitation.tradeRelationship;

    const user = await this.users.findOrCreateFromKeycloak(
      identity.sub,
      identity.email,
      identity.given_name ?? '',
      identity.family_name ?? '',
    );

    await this.prisma.$transaction(async (tx) => {
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
      await tx.customerInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED, acceptedAt },
      });
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
      });
    });

    return { distributorSlug: rel.distributor.slug };
  }
}
