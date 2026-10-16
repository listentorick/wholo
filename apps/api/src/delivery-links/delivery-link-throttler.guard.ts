import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Rate-limits each delivery link separately. Every driver's request reaches
// apps/api from the driver BFF, so counting by caller address would make all
// drivers share one limit; counting by the link's token gives each delivery
// its own (ADR-076).
@Injectable()
export class DeliveryLinkThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const header = req.headers?.['x-delivery-token'];
    const token = Array.isArray(header) ? header[0] : header;
    return token ? `delivery-link:${token}` : req.ip;
  }
}
