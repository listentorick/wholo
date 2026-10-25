import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@wholo/types';

const me = vi.fn();
const setRequestHeadersProvider = vi.fn();
const setApiErrorListener = vi.fn();
vi.mock('@wholo/admin-api-client', () => ({
  adminAuthApi: { me: () => me() },
  setRequestHeadersProvider: (p: unknown) => setRequestHeadersProvider(p),
  setApiErrorListener: (l: unknown) => setApiErrorListener(l),
}));

import { opsScope } from './scope';
import { ACCESS_ENDED_DETAIL, clearSelection, dismissEndedVisit, getEndedVisit, getSelection, setSelection } from './selection';

const home = { id: 'op', organisationId: 'stocdup', organisationType: 'PLATFORM', access: { kind: 'MEMBER' } } as AuthUser;
const vine = { distributorId: 'dist-1', name: 'Vine & Co', grantId: 'g-1', expiresAt: '2099-01-01T00:00:00Z', reason: 'Price lists' };
const supportProfile = { ...home, organisationId: 'dist-1', organisationType: 'DISTRIBUTOR', access: { kind: 'SUPPORT', grantId: 'g-1', expiresAt: vine.expiresAt } } as AuthUser;

describe('opsScope.resolveUser', () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearSelection();
    dismissEndedVisit();
  });

  it('runs as the operator when no wholesaler is selected', async () => {
    await expect(opsScope.resolveUser(home)).resolves.toBe(home);
    expect(me).not.toHaveBeenCalled();
  });

  it('runs as the selected wholesaler when apps/api confirms the support access', async () => {
    setSelection(vine);
    me.mockResolvedValue(supportProfile);
    await expect(opsScope.resolveUser(home)).resolves.toBe(supportProfile);
  });

  it('brings the stored end time up to date when the access was extended', async () => {
    setSelection(vine);
    me.mockResolvedValue({ ...supportProfile, access: { kind: 'SUPPORT', grantId: 'g-1', expiresAt: '2099-01-01T04:00:00Z' } });
    await opsScope.resolveUser(home);
    expect(getSelection()).toMatchObject({ distributorId: 'dist-1', expiresAt: '2099-01-01T04:00:00Z' });
  });

  it('drops a selection apps/api resolved to a different organisation (mismatch guard)', async () => {
    setSelection(vine);
    me.mockResolvedValue({ ...supportProfile, organisationId: 'dist-2' });
    await expect(opsScope.resolveUser(home)).resolves.toBe(home);
    expect(getSelection()).toBeNull();
    expect(getEndedVisit()).toMatchObject({ name: 'Vine & Co', cause: 'REVOKED' });
  });

  it('drops a refused selection, saying time ran out when it had', async () => {
    setSelection({ ...vine, expiresAt: '2000-01-01T00:00:00Z' });
    me.mockImplementation(async () => {
      throw Object.assign(new Error('refused'), { status: 403, problem: { detail: ACCESS_ENDED_DETAIL } });
    });
    await expect(opsScope.resolveUser(home)).resolves.toBe(home);
    expect(getEndedVisit()).toMatchObject({ cause: 'EXPIRED' });
  });

  it.each([
    ['a gateway error', { status: 502, problem: { detail: 'Bad Gateway' } }],
    ['no network', new TypeError('fetch failed')],
  ])('keeps the selection when the access cannot be checked (%s)', async (_, failure) => {
    setSelection(vine);
    me.mockRejectedValue(failure);
    await expect(opsScope.resolveUser(home)).rejects.toThrow();
    expect(getSelection()).toMatchObject({ distributorId: 'dist-1' });
    expect(getEndedVisit()).toBeNull();
  });
});

describe('opsScope.install', () => {
  it('sends the selection on every request', () => {
    opsScope.install();
    const provider = setRequestHeadersProvider.mock.calls[0][0] as () => Record<string, string>;
    setSelection(vine);
    expect(provider()).toEqual({ 'X-Organisation-Id': 'dist-1' });
    clearSelection();
    expect(provider()).toEqual({});
  });
});
