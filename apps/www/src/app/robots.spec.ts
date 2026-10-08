import { describe, expect, it } from 'vitest';
import robots from './robots';

describe('robots', () => {
  it('lets crawlers index the site but keeps them out of the API routes', () => {
    const { rules } = robots();

    expect(rules).toEqual({ userAgent: '*', allow: '/', disallow: '/api/' });
  });

  it('points crawlers at the sitemap', () => {
    expect(robots().sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
