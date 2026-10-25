import { OrganisationType } from '@prisma/client';

/**
 * The membership a request falls back to when its route names no organisation
 * (notifications, PermissionsGuard on routes without `:distributorId`).
 *
 * Never the Stocdup PLATFORM organisation (ADR-078): an operator's platform
 * role is used only where a route asks for it explicitly (PlatformAccessGuard),
 * so an operator who also works at a wholesaler still defaults to that
 * wholesaler. Otherwise the order is unchanged.
 */
export function defaultMembership<M extends { organisation?: { type: OrganisationType } | null }>(
  memberships: M[],
): M | undefined {
  return memberships.find((m) => m.organisation?.type !== OrganisationType.PLATFORM);
}
