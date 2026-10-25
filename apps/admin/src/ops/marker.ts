/**
 * Present in the Ops build's output and never in the admin build's —
 * scripts/check-admin-build-has-no-ops.mjs fails the admin build if it is found.
 * Every module ops-seam.tsx loads must use it (marker.spec.ts), so a leak of
 * any of them is caught, not just of OpsLayout.
 */
export const OPS_BUILD_MARKER = '__STOCDUP_OPS__';
