import { Prisma } from '@prisma/client';

/**
 * The minimum order spend that applies to a customer's order: the
 * trade-relationship-level override takes precedence over the distributor's
 * own default. Shared by OrdersService (enforcement) and PortalService
 * (display) so the two can't drift on this business rule.
 */
export function resolveEffectiveMinimumOrderSpend(
  relationshipMinimumOrderSpend: Prisma.Decimal | null | undefined,
  distributorMinimumOrderSpend: Prisma.Decimal | null | undefined,
): Prisma.Decimal | null {
  return relationshipMinimumOrderSpend ?? distributorMinimumOrderSpend ?? null;
}
