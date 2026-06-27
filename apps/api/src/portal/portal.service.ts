import { Injectable, NotFoundException } from '@nestjs/common';
import { TradeRelationshipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { R2StorageService } from '../asset-images/r2-storage.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private r2Storage: R2StorageService,
  ) {}

  async getMyProfile(customerOrgId: string) {
    const org = await this.prisma.organisation.findFirst({
      where: { id: customerOrgId, deletedAt: null },
      select: {
        name: true, legalName: true, email: true, phone: true,
        billingLine1: true, billingLine2: true, billingCity: true,
        billingState: true, billingPostcode: true, billingCountry: true,
      },
    });
    if (!org) throw new NotFoundException('Organisation not found');
    return {
      name: org.name,
      legalName: org.legalName ?? null,
      email: org.email ?? null,
      phone: org.phone ?? null,
      billingLine1: org.billingLine1 ?? null,
      billingLine2: org.billingLine2 ?? null,
      billingCity: org.billingCity ?? null,
      billingState: org.billingState ?? null,
      billingPostcode: org.billingPostcode ?? null,
      billingCountry: org.billingCountry ?? null,
    };
  }

  async updateMyProfile(customerOrgId: string, dto: UpdateMyProfileDto) {
    const org = await this.prisma.organisation.findFirst({
      where: { id: customerOrgId, deletedAt: null },
      select: { id: true },
    });
    if (!org) throw new NotFoundException('Organisation not found');

    const updated = await this.prisma.organisation.update({
      where: { id: customerOrgId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.legalName !== undefined && { legalName: dto.legalName }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.billingLine1 !== undefined && { billingLine1: dto.billingLine1 }),
        ...(dto.billingLine2 !== undefined && { billingLine2: dto.billingLine2 }),
        ...(dto.billingCity !== undefined && { billingCity: dto.billingCity }),
        ...(dto.billingState !== undefined && { billingState: dto.billingState }),
        ...(dto.billingPostcode !== undefined && { billingPostcode: dto.billingPostcode }),
        ...(dto.billingCountry !== undefined && { billingCountry: dto.billingCountry }),
      },
      select: {
        name: true, legalName: true, email: true, phone: true,
        billingLine1: true, billingLine2: true, billingCity: true,
        billingState: true, billingPostcode: true, billingCountry: true,
      },
    });

    return {
      name: updated.name,
      legalName: updated.legalName ?? null,
      email: updated.email ?? null,
      phone: updated.phone ?? null,
      billingLine1: updated.billingLine1 ?? null,
      billingLine2: updated.billingLine2 ?? null,
      billingCity: updated.billingCity ?? null,
      billingState: updated.billingState ?? null,
      billingPostcode: updated.billingPostcode ?? null,
      billingCountry: updated.billingCountry ?? null,
    };
  }

  async getMyDistributors(customerOrgId: string) {
    const relationships = await this.prisma.tradeRelationship.findMany({
      where: {
        customerId: customerOrgId,
        status: TradeRelationshipStatus.ACTIVE,
        deletedAt: null,
      },
      select: {
        minimumOrderSpend: true,
        distributor: {
          select: {
            id: true, name: true, slug: true, email: true, phone: true,
            distributorSettings: { select: { minimumOrderSpend: true } },
          },
        },
      },
    });

    return Promise.all(
      relationships.map(async ({ distributor, minimumOrderSpend: relationshipMinSpend }) => {
        const [logoImage, orderCount] = await Promise.all([
          this.prisma.assetImage.findFirst({
            where: { assetType: 'distributor-logo', entityId: distributor.id },
          }),
          this.prisma.order.count({
            where: { distributorId: distributor.id, traderCustomerId: customerOrgId },
          }),
        ]);

        const effectiveMinSpend = relationshipMinSpend ?? distributor.distributorSettings?.minimumOrderSpend ?? null;
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
          minimumOrderSpend: effectiveMinSpend != null ? parseFloat(effectiveMinSpend.toString()) : null,
        };
      }),
    );
  }
}
