import { OrganisationType, Role } from '@prisma/client';
import { Permission } from '@wholo/types';
import { ROLE_PERMISSIONS } from './role-permissions';

// ADR-078. An "ops session" is a request whose Keycloak token was issued to the
// Ops app's client AND records an authenticator-level sign-in. Platform powers
// and support grants are honoured only for ops sessions, so a platform
// operator signed in through the ordinary admin app (or with a password alone)
// gets neither. Both values come from the signed token, never from the caller.
export const DEFAULT_OPS_CLIENT_ID = 'stocdup-ops';
export const OPS_MIN_ACR = 2;

export function isOpsSession(payload: { azp?: unknown; acr?: unknown }, opsClientId: string): boolean {
  if (typeof payload.azp !== 'string' || payload.azp !== opsClientId) return false;
  const level = Number(payload.acr);
  return Number.isFinite(level) && level >= OPS_MIN_ACR;
}

/** One organisation the caller may act in, as JwtStrategy resolves it per request. */
export interface MembershipClaim {
  organisationId: string;
  organisationType?: OrganisationType;
  roles: Role[];
  /** Set when this entry comes from an active SupportAccessGrant rather than a Membership. */
  supportGrantId?: string;
  expiresAt?: Date;
}

export interface RequestUser {
  sub: string;
  email?: string;
  organisationId?: string;
  organisationIds?: string[];
  memberships?: MembershipClaim[];
  opsSession?: boolean;
}

export function permissionsOf(membership: MembershipClaim | undefined): Set<Permission> {
  return new Set((membership?.roles ?? []).flatMap((role) => ROLE_PERMISSIONS[role] ?? []));
}

/** The caller's membership of the Stocdup PLATFORM organisation, if any. */
export function platformMembership(user: RequestUser | undefined): MembershipClaim | undefined {
  return user?.memberships?.find((m) => m.organisationType === OrganisationType.PLATFORM && !m.supportGrantId);
}

/** True when the caller holds every given platform permission AND is in an ops session. */
export function hasPlatformPermissions(user: RequestUser | undefined, required: Permission[]): boolean {
  if (!user?.opsSession) return false;
  const granted = permissionsOf(platformMembership(user));
  return required.every((p) => granted.has(p));
}

/** The caller's own (non-grant) membership of an organisation. */
export function ownMembership(user: RequestUser | undefined, organisationId: string): MembershipClaim | undefined {
  return user?.memberships?.find((m) => m.organisationId === organisationId && !m.supportGrantId);
}
