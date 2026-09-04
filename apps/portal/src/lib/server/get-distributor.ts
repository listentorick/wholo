import type { DistributorInfo } from '@wholo/types';

/**
 * Server-side distributor-by-slug lookup, called from `[distributorSlug]/layout.tsx`
 * before any client component mounts. Hits `apps/api` directly rather than looping
 * back through `apps/portal-api`'s own HTTP layer — `CENTRAL_API_URL` is already in
 * this process's environment because portal-api boots its Next.js instance and its
 * Nest app in the same process (see `apps/portal-api/src/api-client/api-client.service.ts`
 * for the sibling client that uses the same env var and default).
 *
 * Only a 404 resolves to `null` (→ the caller renders the not-found page). Any other
 * failure throws, so a transient backend outage isn't mistaken for "this supplier
 * doesn't exist".
 */
export async function getDistributorForSlug(slug: string): Promise<DistributorInfo | null> {
  const base = process.env.CENTRAL_API_URL ?? 'http://wholo-api:3001';
  const res = await fetch(`${base}/api/v1/distributors/${encodeURIComponent(slug)}`, { cache: 'no-store' });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to resolve distributor "${slug}": ${res.status}`);

  return res.json() as Promise<DistributorInfo>;
}
