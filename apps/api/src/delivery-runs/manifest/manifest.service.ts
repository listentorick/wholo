import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { DeliveryTokenSigner } from '../../delivery-links/delivery-token.signer';
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
    private signer: DeliveryTokenSigner,
    config: ConfigService,
  ) {
    this.driverAppUrl = config.getOrThrow<string>('DRIVER_APP_URL');
  }

  async generate(distributorId: string, runId: string, actorUserId: string): Promise<ManifestResult> {
    const generatedAt = new Date();

    const data = await this.manifestData.getManifestData(distributorId, runId);
    const logoPng = await this.logoService.getLogoPng(distributorId);

    // Signing is synchronous and stateless (no DB write) — the same order
    // always produces the same URL, so reprinting this manifest reproduces
    // an identical QR code. See DeliveryTokenSigner.
    const qrEntries = await Promise.all(
      data.orders.map(async (order) => {
        const deliveryUrl = `${this.driverAppUrl}/d#${this.signer.sign(order.orderId)}`;
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
