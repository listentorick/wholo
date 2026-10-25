import type { AuthUser } from '@wholo/types';

/**
 * True in the Ops build of this app (ADR-078). `NEXT_PUBLIC_APP_MODE` is
 * inlined at build time, so in the admin build this is the constant `false`.
 *
 * Code that loads anything from `src/ops` must test
 * `process.env.NEXT_PUBLIC_APP_MODE === 'ops'` inline (see ops-seam.tsx), not
 * this constant: the bundler only drops a dead branch — and the ops code it
 * would import — when the condition is written where the import is.
 */
export const isOpsBuild = process.env.NEXT_PUBLIC_APP_MODE === 'ops';

/** In the Ops build, the wholesaler screens need a wholesaler opened through support access. */
export function needsWholesalerSelection(user: Pick<AuthUser, 'access'>): boolean {
  return isOpsBuild && user.access?.kind !== 'SUPPORT';
}
