'use client';

import dynamic from 'next/dynamic';
import type { AuthUser } from '@wholo/types';

/**
 * The ONLY file outside src/ops that may import from it (ADR-078; enforced by
 * eslint `no-restricted-imports`). Every import below sits behind
 * `process.env.NEXT_PUBLIC_APP_MODE === 'ops'` written inline: the value is
 * inlined at build time, so in the admin build each condition is `false` and
 * the bundler drops the branch together with the ops code it would load.
 * `scripts/check-admin-build-has-no-ops.mjs` checks the admin output for it.
 */

export interface OpsScope {
  /** Wire the tab's selected wholesaler into every request, and react to access ending. */
  install(): void;
  /** The profile to run the app as: the selected wholesaler's, or the operator's own. */
  resolveUser(home: AuthUser): Promise<AuthUser>;
}

export function loadOpsScope(): Promise<OpsScope | null> {
  if (process.env.NEXT_PUBLIC_APP_MODE === 'ops') {
    return import('@/ops/scope').then((m) => m.opsScope);
  }
  return Promise.resolve(null);
}

const Nothing = () => null;

/** The amber "you are in someone else's account" bar above the admin screens. */
export const OpsSupportBar =
  process.env.NEXT_PUBLIC_APP_MODE === 'ops' ? dynamic(() => import('@/ops/SupportBar').then((m) => m.SupportBar), { ssr: false }) : Nothing;

/** "OPS" tag beside the logo. */
export const OpsLogoTag =
  process.env.NEXT_PUBLIC_APP_MODE === 'ops' ? dynamic(() => import('@/ops/SidebarParts').then((m) => m.OpsLogoTag), { ssr: false }) : Nothing;

/** Note under the nav about what support access hides. */
export const OpsSidebarNote =
  process.env.NEXT_PUBLIC_APP_MODE === 'ops' ? dynamic(() => import('@/ops/SidebarParts').then((m) => m.OpsSidebarNote), { ssr: false }) : Nothing;

/** Names the wholesaler at the top of every dialog, so a confirm is never ambiguous. */
export const OpsDialogChip =
  process.env.NEXT_PUBLIC_APP_MODE === 'ops' ? dynamic(() => import('@/ops/SidebarParts').then((m) => m.OpsDialogChip), { ssr: false }) : Nothing;
