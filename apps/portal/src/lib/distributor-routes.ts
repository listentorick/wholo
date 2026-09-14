/**
 * Route classification for the distributor storefront shell, shared by
 * `DistributorShell` (which decides what chrome/mode to render) and
 * `ScrollReset` (which decides where a route change should land the scroll).
 * Also the single source of truth for the `/orders` path segment, previously
 * duplicated as a magic string in three unrelated files.
 */

/** The `<main>` element's id — the landing target for a storefront sub-page arrival. */
export const STOREFRONT_MAIN_ID = 'storefront-main';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function distributorOrdersHref(slug: string): string {
  return `/${slug}/orders`;
}

/** The storefront itself — the single page with the in-page Catalogue/About/Delivery sections. */
export function isStorefrontRoute(slug: string, pathname: string): boolean {
  return pathname === `/${slug}`;
}

export function isProductDetailRoute(slug: string, pathname: string): boolean {
  return new RegExp(`^/${escapeRe(slug)}/products/[^/]+$`).test(pathname);
}

export function isOrdersRoute(slug: string, pathname: string): boolean {
  return new RegExp(`^/${escapeRe(slug)}/orders(/[^/]+)?$`).test(pathname);
}

/**
 * A storefront sub-page: shares the persistent chrome with the storefront
 * itself but has its own main content (a product, the order list) rather
 * than being an in-page section of the storefront — so arriving here should
 * land at the top of that content, not the document top.
 */
export function isStorefrontSubpageRoute(slug: string, pathname: string): boolean {
  return isProductDetailRoute(slug, pathname) || isOrdersRoute(slug, pathname);
}
