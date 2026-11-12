import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Rate-limits the unauthenticated invitation lookups (ADR-081) per invitation
// token. Every request reaches apps/api from a BFF, so counting by caller
// address would make every invitee share one limit (same reasoning as
// DeliveryLinkThrottlerGuard, ADR-076).
//
// ThrottlerModule is global: its storage and default options come from the
// one ThrottlerModule.forRoot in DeliveryLinksModule. Routes using this guard
// set their own limit with @Throttle(INVITATION_LOOKUP_LIMIT).
@Injectable()
export class InvitationLookupThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const token = req.body?.token;
    return typeof token === 'string' && token ? `invitation-lookup:${token}` : req.ip;
  }
}

export const INVITATION_LOOKUP_LIMIT = { default: { limit: 10, ttl: 60_000 } };
