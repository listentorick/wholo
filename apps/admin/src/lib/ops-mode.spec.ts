import { afterEach, describe, expect, it, vi } from 'vitest';

// isOpsBuild is fixed when the module loads, as NEXT_PUBLIC_APP_MODE is at build time.
async function load(mode: string) {
  vi.stubEnv('NEXT_PUBLIC_APP_MODE', mode);
  vi.resetModules();
  return import('./ops-mode');
}

describe('needsWholesalerSelection', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is never needed in the admin build', async () => {
    const { needsWholesalerSelection } = await load('');
    expect(needsWholesalerSelection({ access: { kind: 'MEMBER' } })).toBe(false);
    expect(needsWholesalerSelection({})).toBe(false);
  });

  it('in the Ops build, lets wholesaler screens run only under support access', async () => {
    const { needsWholesalerSelection } = await load('ops');
    expect(needsWholesalerSelection({ access: { kind: 'SUPPORT', grantId: 'g-1', expiresAt: '2099-01-01T00:00:00Z' } })).toBe(false);
    expect(needsWholesalerSelection({ access: { kind: 'MEMBER' } })).toBe(true);
    expect(needsWholesalerSelection({})).toBe(true);
  });
});
