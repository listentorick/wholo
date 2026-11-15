import { describe, expect, it } from 'vitest';
import { buildLinkHeader, HOMEPAGE_LINKS } from './link-header';

describe('buildLinkHeader', () => {
  it('advertises the help site, sitemap and privacy policy on the homepage', () => {
    expect(buildLinkHeader(HOMEPAGE_LINKS)).toBe(
      '<https://help.stocdup.com>; rel="service-doc", </sitemap.xml>; rel="sitemap", </privacy>; rel="privacy-policy"',
    );
  });

  it('formats a single link as an RFC 8288 link-value', () => {
    expect(buildLinkHeader([{ href: '/x', rel: 'describedby' }])).toBe('</x>; rel="describedby"');
  });

  it('returns an empty string for no links', () => {
    expect(buildLinkHeader([])).toBe('');
  });
});
