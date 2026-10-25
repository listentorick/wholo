import { Injectable } from '@nestjs/common';
import { OrganisationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Reads a user's currently active support grants (ADR-078) for JwtStrategy.
 * Active = not revoked, started, not yet expired, on a live DISTRIBUTOR.
 * Evaluated on every request, so a grant stops working the moment it ends.
 */
@Injectable()
export class SupportAccessReader {
  constructor(private readonly prisma: PrismaService) {}

  findActiveForUser(userId: string, now: Date = new Date()) {
    return this.prisma.supportAccessGrant.findMany({
      where: {
        userId,
        revokedAt: null,
        startsAt: { lte: now },
        expiresAt: { gt: now },
        distributor: { type: OrganisationType.DISTRIBUTOR, deletedAt: null },
      },
      select: { id: true, distributorId: true, role: true, expiresAt: true },
    });
  }
}
