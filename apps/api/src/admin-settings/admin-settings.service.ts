import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class AdminSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async find(distributorId: string) {
    const [org, settings] = await Promise.all([
      this.prisma.organisation.findUniqueOrThrow({ where: { id: distributorId } }),
      this.prisma.distributorSettings.upsert({
        where: { distributorId },
        create: { distributorId },
        update: {},
      }),
    ]);

    return {
      name: org.name,
      email: org.email,
      phone: org.phone,
      slug: org.slug,
      addressLine1: org.addressLine1,
      addressLine2: org.addressLine2,
      addressCity: org.addressCity,
      addressState: org.addressState,
      addressPostcode: org.addressPostcode,
      addressCountry: org.addressCountry,
      defaultOrderAcceptanceMode: settings.defaultOrderAcceptanceMode,
      marketplaceVisible: settings.marketplaceVisible,
      marketplaceDescription: settings.marketplaceDescription,
      tagline: settings.tagline,
      aboutText: settings.aboutText,
      orderNotificationEmails: settings.orderNotificationEmails,
      processingDays: settings.processingDays,
      minimumOrderSpend: settings.minimumOrderSpend?.toString() ?? null,
    };
  }

  async update(distributorId: string, dto: UpdateSettingsDto) {
    const {
      name, email, phone, slug,
      addressLine1, addressLine2, addressCity, addressState, addressPostcode, addressCountry,
      minimumOrderSpend: rawMinSpend,
      ...restSettingsFields
    } = dto;

    const orgPatch = Object.fromEntries(
      Object.entries({ name, email, phone, slug, addressLine1, addressLine2, addressCity, addressState, addressPostcode, addressCountry })
        .filter(([, v]) => v !== undefined),
    );

    const settingsPatch: Record<string, unknown> = Object.fromEntries(
      Object.entries(restSettingsFields).filter(([, v]) => v !== undefined),
    );
    if (rawMinSpend !== undefined) {
      settingsPatch.minimumOrderSpend = rawMinSpend != null ? new Prisma.Decimal(rawMinSpend) : null;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        if (Object.keys(orgPatch).length > 0) {
          await tx.organisation.update({ where: { id: distributorId }, data: orgPatch });
        }
        await tx.distributorSettings.upsert({
          where: { distributorId },
          create: { distributorId, ...settingsPatch },
          update: settingsPatch,
        });
      });
    } catch (e) {
      // Slug is unique across organisations — surface a collision as a clear
      // 409 rather than an unhandled P2002 (500).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('That portal address is already taken — choose another.');
      }
      throw e;
    }

    return this.find(distributorId);
  }
}
