'use client';

/**
 * Thin analytics shim. Phase E wires this to self-hosted Plausible (proxied
 * through this origin). Until then every call is a safe no-op.
 */
export type AnalyticsEvent =
  | 'cta_click'
  | 'form_start'
  | 'form_submit'
  | 'form_success'
  | 'form_error';

type Props = Record<string, string | number | boolean | undefined>;

export function track(event: AnalyticsEvent, props?: Props): void {
  if (typeof window === 'undefined') return;
  const plausible = (window as unknown as { plausible?: (e: string, o?: { props?: Props }) => void })
    .plausible;
  try {
    plausible?.(event, props ? { props } : undefined);
  } catch {
    /* never let analytics break the page */
  }
}
