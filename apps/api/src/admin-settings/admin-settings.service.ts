import { Injectable } from '@nestjs/common';
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
    };
  }

  async update(distributorId: string, dto: UpdateSettingsDto) {
    const {
      name, email, phone, slug,
      addressLine1, addressLine2, addressCity, addressState, addressPostcode, addressCountry,
      ...settingsFields
    } = dto;

    const orgPatch = Object.fromEntries(
      Object.entries({ name, email, phone, slug, addressLine1, addressLine2, addressCity, addressState, addressPostcode, addressCountry })
        .filter(([, v]) => v !== undefined),
    );

    const settingsPatch = Object.fromEntries(
      Object.entries(settingsFields).filter(([, v]) => v !== undefined),
    );

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

    return this.find(distributorId);
  }
}
