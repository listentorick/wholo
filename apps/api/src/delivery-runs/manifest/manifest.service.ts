import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { DeliveryLinkTokensService } from '../../delivery-links/delivery-link-tokens.service';
import { ManifestDataService } from './manifest-data.service';
import { ManifestLogoService } from './logo.service';
import { generateOrderQrPng } from './qr-code.util';
import { buildManifestPdf } from './manifest-pdf.builder';

export interface ManifestResult {
  buffer: Buffer;
  filename: string;
}

@Injectable()
export class ManifestService {
  private readonly driverAppUrl: string;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private manifestData: ManifestDataService,
    private logoService: ManifestLogoService,
    private linkTokens: DeliveryLinkTokensService,
    config: ConfigService,
  ) {
    this.driverAppUrl = config.getOrThrow<string>('DRIVER_APP_URL');
  }

  async generate(distributorId: string, runId: string, actorUserId: string): Promise<ManifestResult> {
    const generatedAt = new Date();

    const data = await this.manifestData.getManifestData(distributorId, runId);
    const logoPng = await this.logoService.getLogoPng(distributorId);

    // Each order's link carries its random delivery-link token (ADR-076),
    // created on the first print and reused afterwards, so reprinting this
    // manifest reproduces identical QR codes. The token goes in the URL
    // fragment, which browsers never send to a server (ADR-059).
    const tokens = await this.linkTokens.ensureFor(data.orders.map((order) => order.orderId));
    const qrEntries = await Promise.all(
      data.orders.map(async (order) => {
        const deliveryUrl = `${this.driverAppUrl}/d#${tokens.get(order.orderId)}`;
        return [order.orderId, await generateOrderQrPng(deliveryUrl)] as const;
      }),
    );
    const qrPngByOrderId = new Map(qrEntries);

    const buffer = await buildManifestPdf(data, { logoPng, qrPngByOrderId }, generatedAt);

    await this.audit.record(this.prisma, {
      distributorId,
      entityType: 'DELIVERY_RUN',
      entityId: runId,
      action: 'DELIVERY_RUN_MANIFEST_GENERATED',
      actorType: ActorType.USER,
      actorUserId,
      summary: `Generated driver manifest for run ${data.runName}`,
      changes: { orderCount: data.orders.length },
    });

    return { buffer, filename: `manifest-${data.runReference}.pdf` };
  }
}
