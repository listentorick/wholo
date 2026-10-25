import { appMode, mayUseApp, profilePath, requestedOrganisation } from './app-mode';

describe('appMode', () => {
  it.each([
    [undefined, 'admin'],
    ['', 'admin'],
    ['OPS', 'admin'],
    ['ops', 'ops'],
  ])('%s → %s', (env, mode) => {
    expect(appMode(env)).toBe(mode);
  });
});

describe('requestedOrganisation', () => {
  it('is ignored by the admin app', () => {
    expect(requestedOrganisation('admin', { 'x-organisation-id': 'dist-b' })).toBeUndefined();
  });

  it('is read by the Ops app', () => {
    expect(requestedOrganisation('ops', { 'x-organisation-id': ' dist-b ' })).toBe('dist-b');
    expect(requestedOrganisation('ops', { 'x-organisation-id': ['dist-b', 'dist-c'] })).toBe('dist-b');
    expect(requestedOrganisation('ops', { 'x-organisation-id': '  ' })).toBeUndefined();
    expect(requestedOrganisation('ops', {})).toBeUndefined();
  });
});

describe('profilePath', () => {
  it('asks apps/api for the selected organisation, encoded', () => {
    expect(profilePath('ops', 'a&b=c')).toBe('/auth/me?organisationId=a%26b%3Dc');
  });

  it('otherwise asks for the kind of organisation the app serves', () => {
    expect(profilePath('admin', undefined)).toBe('/auth/me?organisationType=DISTRIBUTOR');
    expect(profilePath('ops', undefined)).toBe('/auth/me?organisationType=PLATFORM');
  });
});

describe('mayUseApp', () => {
  const member = { kind: 'MEMBER' } as const;
  const support = { kind: 'SUPPORT', grantId: 'g', expiresAt: '2026-10-23T16:00:00Z' } as const;

  it('admin app: distributors only (ADR-053)', () => {
    expect(mayUseApp({ organisationType: 'DISTRIBUTOR', access: member }, 'admin', false)).toBe(true);
    expect(mayUseApp({ organisationType: 'TRADE_CUSTOMER', access: member }, 'admin', false)).toBe(false);
    expect(mayUseApp({ organisationType: 'PLATFORM', access: member }, 'admin', false)).toBe(false);
    expect(mayUseApp({}, 'admin', false)).toBe(false);
  });

  it('Ops app with nothing selected: Stocdup platform users only', () => {
    expect(mayUseApp({ organisationType: 'PLATFORM', access: member }, 'ops', false)).toBe(true);
    expect(mayUseApp({ organisationType: 'DISTRIBUTOR', access: member }, 'ops', false)).toBe(false);
  });

  it('Ops app with a wholesaler selected: support access only, never a membership', () => {
    expect(mayUseApp({ organisationType: 'DISTRIBUTOR', access: support }, 'ops', true)).toBe(true);
    expect(mayUseApp({ organisationType: 'DISTRIBUTOR', access: member }, 'ops', true)).toBe(false);
    expect(mayUseApp({ organisationType: 'TRADE_CUSTOMER', access: support }, 'ops', true)).toBe(false);
  });
});
