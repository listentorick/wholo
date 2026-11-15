// RFC 8288 `Link` response header for the homepage, so agents and crawlers can
// find the site's useful resources without parsing HTML. Only resources that
// really exist are listed: there is no public API, so no api-catalog.

export interface LinkTarget {
  href: string;
  rel: string;
}

export const HOMEPAGE_LINKS: readonly LinkTarget[] = [
  { href: 'https://help.stocdup.com', rel: 'service-doc' },
  { href: '/sitemap.xml', rel: 'sitemap' },
  { href: '/privacy', rel: 'privacy-policy' },
];

export function buildLinkHeader(links: readonly LinkTarget[]): string {
  return links.map(({ href, rel }) => `<${href}>; rel="${rel}"`).join(', ');
}
