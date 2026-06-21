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
import type { KeycloakIdentity } from '../auth/strategies/portal-jwt.strategy';

@Injectable()
export class PortalInvitationsService {
  constructor(
    private prisma: PrismaService,
    private users: UsersService,
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

    await this.prisma.$transaction([
      this.prisma.membership.upsert({
        where: { userId_organisationId: { userId: user.id, organisationId: rel.customerId } },
        create: { userId: user.id, organisationId: rel.customerId, role: Role.TRADE_CUSTOMER },
        update: {},
      }),
      this.prisma.customerInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
      }),
      this.prisma.tradeRelationship.update({
        where: { id: rel.id },
        data: { status: TradeRelationshipStatus.ACTIVE },
      }),
    ]);

    return { distributorSlug: rel.distributor.slug };
  }
}
