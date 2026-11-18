import { describe, expect, it } from 'vitest';
import { buildStructuredData } from './structured-data';

const SITE = 'https://www.example.test';

function nodes() {
  const graph = buildStructuredData(SITE, 'A description')['@graph'] as Array<Record<string, unknown>>;
  const org = graph.filter((n) => n['@type'] === 'Organization');
  const site = graph.filter((n) => n['@type'] === 'WebSite');
  return { graph, org, site };
}

describe('buildStructuredData', () => {
  it('has exactly one Organization and one WebSite', () => {
    const { org, site } = nodes();
    expect(org).toHaveLength(1);
    expect(site).toHaveLength(1);
  });

  it('links the WebSite publisher to the Organization', () => {
    const { org, site } = nodes();
    expect(site[0].publisher).toEqual({ '@id': org[0]['@id'] });
  });

  it('describes the Stocdup organisation', () => {
    const { org } = nodes();
    expect(org[0]).toMatchObject({
      name: 'Stocdup',
      email: 'hello@stocdup.com',
      logo: `${SITE}/logo-mark.png`,
      description: 'A description',
    });
    expect(org[0].sameAs).toContain('https://www.linkedin.com/company/stocdup/');
  });

  it('names the website Stocdup', () => {
    const { site } = nodes();
    expect(site[0]).toMatchObject({ name: 'Stocdup', url: `${SITE}/` });
  });

  it('is safe to inline in a script tag', () => {
    expect(JSON.stringify(buildStructuredData(SITE, 'x')).toLowerCase()).not.toContain('</script');
  });
});
