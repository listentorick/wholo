import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

async function loadMiddleware(variants?: string) {
  vi.resetModules();
  if (variants === undefined) vi.stubEnv('EXPERIMENT_HERO_VARIANTS', '');
  else vi.stubEnv('EXPERIMENT_HERO_VARIANTS', variants);
  return (await import('./middleware')).middleware;
}

const req = (cookie?: string) =>
  new NextRequest('https://www.stocdup.com/', {
    headers: cookie ? { cookie: `hero_variant=${cookie}` } : {},
  });

afterEach(() => vi.unstubAllGlobals());

describe('middleware — hero A/B', () => {
  it('does nothing when the experiment is off', async () => {
    const middleware = await loadMiddleware();
    const res = middleware(req());
    expect(res.cookies.get('hero_variant')).toBeUndefined();
  });

  it('assigns a variant cookie when 2+ variants are configured', async () => {
    const middleware = await loadMiddleware('default,growth,operations');
    const res = middleware(req());
    const assigned = res.cookies.get('hero_variant')?.value;
    expect(['default', 'growth', 'operations']).toContain(assigned);
  });

  it('keeps a valid existing assignment', async () => {
    const middleware = await loadMiddleware('default,growth');
    const res = middleware(req('growth'));
    expect(res.cookies.get('hero_variant')).toBeUndefined();
  });

  it('reassigns when the existing cookie is not a current variant', async () => {
    const middleware = await loadMiddleware('default,growth');
    const res = middleware(req('operations'));
    expect(['default', 'growth']).toContain(res.cookies.get('hero_variant')?.value);
  });
});
