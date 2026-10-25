import type { AuthUser } from '@wholo/types';

/**
 * One codebase, two deployments (ADR-078): the admin app (`APP_MODE` unset)
 * and the Ops app (`APP_MODE=ops`). The mode is runtime config on the pod, so
 * the same image code serves both; only what this file decides differs.
 */
export type AppMode = 'admin' | 'ops';

/** The wholesaler an Ops tab has selected. Ignored by the admin app. */
export const ORGANISATION_HEADER = 'x-organisation-id';

export function appMode(env: string | undefined = process.env.APP_MODE): AppMode {
  return env === 'ops' ? 'ops' : 'admin';
}

/**
 * The organisation the request asks for. Only the Ops app reads the header —
 * the admin app keeps choosing the organisation in apps/api as it always has.
 * The value is a claim: apps/api checks it against memberships and active
 * grants and refuses anything else.
 */
export function requestedOrganisation(mode: AppMode, headers: Record<string, string | string[] | undefined>): string | undefined {
  if (mode !== 'ops') return undefined;
  const raw = headers[ORGANISATION_HEADER];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return value || undefined;
}

/** The kind of organisation each app serves; `mayUseApp` refuses any other. */
export const HOME_ORGANISATION_TYPE: Record<AppMode, NonNullable<AuthUser['organisationType']>> = {
  admin: 'DISTRIBUTOR',
  ops: 'PLATFORM',
};

/**
 * Where to read the caller's profile. A selected wholesaler is asked for by
 * id; otherwise the app asks for its own kind, so a user of several kinds (an
 * operator who also works at a wholesaler) gets the right membership in each.
 */
export function profilePath(mode: AppMode, organisationId: string | undefined): string {
  if (organisationId) return `/auth/me?organisationId=${encodeURIComponent(organisationId)}`;
  return `/auth/me?organisationType=${HOME_ORGANISATION_TYPE[mode]}`;
}

/**
 * ADR-053, extended by ADR-078. Admin app: the organisation must be a
 * DISTRIBUTOR, as before. Ops app: with nothing selected the user must be on
 * the Stocdup PLATFORM organisation; with a wholesaler selected it must be a
 * DISTRIBUTOR reached through support access — never a membership, so the Ops
 * app cannot be used as a second door into one's own wholesaler.
 */
export function mayUseApp(profile: Pick<AuthUser, 'organisationType' | 'access'>, mode: AppMode, selected: boolean): boolean {
  if (mode === 'admin') return profile.organisationType === 'DISTRIBUTOR';
  if (!selected) return profile.organisationType === 'PLATFORM';
  return profile.organisationType === 'DISTRIBUTOR' && profile.access?.kind === 'SUPPORT';
}
