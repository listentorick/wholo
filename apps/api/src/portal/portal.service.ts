import { Injectable } from '@nestjs/common';
import { TradeRelationshipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { R2StorageService } from '../asset-images/r2-storage.service';

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private r2Storage: R2StorageService,
  ) {}

  async getMyDistributors(customerOrgId: string) {
    const relationships = await this.prisma.tradeRelationship.findMany({
      where: {
        customerId: customerOrgId,
        status: TradeRelationshipStatus.ACTIVE,
        deletedAt: null,
      },
      select: {
        distributor: {
          select: { id: true, name: true, slug: true, email: true, phone: true },
        },
      },
    });

    return Promise.all(
      relationships.map(async ({ distributor }) => {
        const [logoImage, orderCount] = await Promise.all([
          this.prisma.assetImage.findFirst({
            where: { assetType: 'distributor-logo', entityId: distributor.id },
          }),
          this.prisma.order.count({
            where: { distributorId: distributor.id, traderCustomerId: customerOrgId },
          }),
        ]);

        return {
          id: distributor.id,
          name: distributor.name,
          slug: distributor.slug!,
          email: distributor.email,
          phone: distributor.phone,
          orderCount,
          logoUrl: logoImage
            ? this.r2Storage.getPublicUrl((logoImage.variants as Record<string, string>).full)
            : null,
        };
      }),
    );
  }
}
