const MAX_SLUG_LENGTH = 60;

/** Canonical slug shape: lowercase alphanumerics separated by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Derive a URL-safe slug from a display name (ADR-028: slugs are derived from
 * the name at creation time and are effectively immutable afterwards).
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
  return slug || 'distributor';
}

/**
 * Pick the first slug not present in `taken`: the base itself, then
 * `base-2`, `base-3`, … Callers pass the set of existing slugs sharing the
 * base prefix; the DB unique constraint remains the backstop for races.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
