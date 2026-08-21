import { Injectable } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
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
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private manifestData: ManifestDataService,
    private logoService: ManifestLogoService,
  ) {}

  async generate(distributorId: string, runId: string, actorUserId: string): Promise<ManifestResult> {
    const generatedAt = new Date();

    const data = await this.manifestData.getManifestData(distributorId, runId);
    const logoPng = await this.logoService.getLogoPng(distributorId);

    const qrEntries = await Promise.all(
      data.orders.map(async (order) => [order.orderId, await generateOrderQrPng(order.orderNumber)] as const),
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
