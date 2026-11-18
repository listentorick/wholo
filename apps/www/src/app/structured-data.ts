/**
 * Site-wide schema.org JSON-LD for the marketing site.
 *
 * An Organization and a WebSite node in one @graph, linked by @id. Google uses
 * the WebSite name for the site name in results, and the Organization's
 * sameAs/email to tie the "Stocdup" brand to a known entity.
 */
export function buildStructuredData(siteUrl: string, description: string) {
  const organizationId = `${siteUrl}/#organization`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: 'Stocdup',
        url: siteUrl,
        description,
        logo: `${siteUrl}/logo-mark.png`,
        email: 'hello@stocdup.com',
        sameAs: ['https://www.linkedin.com/company/stocdup/'],
        areaServed: 'GB',
        slogan: 'Sell more. Run smoother.',
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        name: 'Stocdup',
        alternateName: ['stocdup.com', 'www.stocdup.com'],
        url: `${siteUrl}/`,
        inLanguage: 'en-GB',
        publisher: { '@id': organizationId },
      },
    ],
  };
}
