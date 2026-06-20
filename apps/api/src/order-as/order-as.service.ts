import { Injectable, NotFoundException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { TradeRelationshipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const DELIVERY_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class OrderAsService {
  constructor(private prisma: PrismaService) {}

  async createOrRefreshSession(adminUserId: string, distributorId: string, tradeRelationshipId: string) {
    // Look up by trade relationship ID — binding to the relationship ensures the session
    // cannot be used to order from a different distributor.
    const rel = await this.prisma.tradeRelationship.findUnique({
      where: { id: tradeRelationshipId },
      include: { distributor: { select: { id: true, slug: true } } },
    });

    if (!rel || rel.distributorId !== distributorId) throw new NotFoundException('Trade relationship not found');
    if (rel.status !== TradeRelationshipStatus.ACTIVE) {
      throw new UnprocessableEntityException('No active trade relationship between distributor and customer');
    }

    const { customerId } = rel;
    const distributorSlug = rel.distributor.slug;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    // Upsert session — same (admin, trade relationship) pair always returns the same stable session ID
    const sessionId = randomBytes(24).toString('base64url');
    const session = await this.prisma.orderAsSession.upsert({
      where: { adminUserId_tradeRelationshipId: { adminUserId, tradeRelationshipId } },
      create: { id: sessionId, adminUserId, tradeRelationshipId, customerId, distributorId, expiresAt },
      update: { expiresAt },
      select: { id: true },
    });

    // Mint a short-lived single-use delivery token
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    await this.prisma.orderAsDeliveryToken.create({
      data: {
        tokenHash,
        sessionId: session.id,
        expiresAt: new Date(now.getTime() + DELIVERY_TOKEN_TTL_MS),
      },
    });

    return { deliveryToken: rawToken, distributorSlug };
  }

  async exchangeDeliveryToken(rawToken: string, adminUserId: string) {
    const tokenHash = sha256(rawToken);
    const record = await this.prisma.orderAsDeliveryToken.findUnique({
      where: { tokenHash },
      include: {
        session: {
          include: {
            customer: { select: { id: true, name: true } },
            distributor: { select: { id: true, slug: true } },
          },
        },
      },
    });

    if (!record) throw new UnauthorizedException('Invalid or expired link');
    if (record.usedAt) throw new UnauthorizedException('This link has already been used');
    if (record.expiresAt < new Date()) throw new UnauthorizedException('This link has expired');
    if (record.session.adminUserId !== adminUserId) throw new UnauthorizedException('This link is not valid for your account');
    if (record.session.expiresAt < new Date()) throw new UnauthorizedException('Your session has expired — please request a new link');

    await this.prisma.orderAsDeliveryToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    return {
      sessionToken: record.session.id,
      customerId: record.session.customerId,
      customerName: record.session.customer.name,
      distributorId: record.session.distributorId,
      distributorSlug: record.session.distributor.slug,
    };
  }

  async resolveSession(sessionToken: string, adminUserId: string) {
    const session = await this.prisma.orderAsSession.findUnique({
      where: { id: sessionToken },
      select: { adminUserId: true, customerId: true, distributorId: true, expiresAt: true },
    });

    if (!session) throw new UnauthorizedException('Order-as session not found');
    if (session.expiresAt < new Date()) throw new UnauthorizedException('Order-as session has expired');
    if (session.adminUserId !== adminUserId) throw new UnauthorizedException('Order-as session does not belong to you');

    return { customerId: session.customerId, distributorId: session.distributorId };
  }

  async deleteSession(sessionToken: string, adminUserId: string) {
    await this.prisma.orderAsSession.deleteMany({
      where: { id: sessionToken, adminUserId },
    });
  }
}
