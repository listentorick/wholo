import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@wholo/admin-api-client', () => ({ setTokenProvider: vi.fn() }));
vi.mock('./keycloak', () => ({
  ensureKeycloak: vi.fn(),
  setTokenExpiredHandler: vi.fn(),
}));

import { ensureKeycloak, setTokenExpiredHandler } from './keycloak';
import { setTokenProvider } from '@wholo/admin-api-client';

type AuthTokenModule = typeof import('./auth-token');

function makeKc(overrides: Record<string, unknown> = {}) {
  return {
    authenticated: true,
    token: 'fresh-token',
    updateToken: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

async function load(): Promise<AuthTokenModule> {
  vi.resetModules();
  return import('./auth-token');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getAuthToken', () => {
  it('refreshes with updateToken(30) then returns the current token', async () => {
    const kc = makeKc();
    (ensureKeycloak as any).mockResolvedValue(kc);
    const { getAuthToken } = await load();

    await expect(getAuthToken()).resolves.toBe('fresh-token');
    expect(kc.updateToken).toHaveBeenCalledWith(30);
  });

  it('shares a single refresh across concurrent callers', async () => {
    let resolveRefresh!: () => void;
    const kc = makeKc({
      updateToken: vi.fn().mockImplementation(
        () => new Promise<boolean>((r) => { resolveRefresh = () => r(true); }),
      ),
    });
    (ensureKeycloak as any).mockResolvedValue(kc);
    const { getAuthToken } = await load();

    const calls = Promise.all([getAuthToken(), getAuthToken(), getAuthToken()]);
    await Promise.resolve();
    resolveRefresh();

    await expect(calls).resolves.toEqual(['fresh-token', 'fresh-token', 'fresh-token']);
    expect(kc.updateToken).toHaveBeenCalledTimes(1);
  });

  it('latches session-expired on refresh failure, notifies listeners, and rejects', async () => {
    const kc = makeKc({ updateToken: vi.fn().mockRejectedValue(new Error('refresh failed')) });
    (ensureKeycloak as any).mockResolvedValue(kc);
    const mod = await load();
    const listener = vi.fn();
    mod.onSessionExpired(listener);

    await expect(mod.getAuthToken()).rejects.toBeInstanceOf(mod.SessionExpiredError);
    expect(mod.isSessionExpired()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('once latched, further calls reject without hitting keycloak again', async () => {
    const kc = makeKc({ updateToken: vi.fn().mockRejectedValue(new Error('refresh failed')) });
    (ensureKeycloak as any).mockResolvedValue(kc);
    const mod = await load();

    await expect(mod.getAuthToken()).rejects.toBeInstanceOf(mod.SessionExpiredError);
    (ensureKeycloak as any).mockClear();
    kc.updateToken.mockClear();

    await expect(mod.getAuthToken()).rejects.toBeInstanceOf(mod.SessionExpiredError);
    await expect(mod.getAuthToken()).rejects.toBeInstanceOf(mod.SessionExpiredError);
    expect(ensureKeycloak).not.toHaveBeenCalled();
    expect(kc.updateToken).not.toHaveBeenCalled();
  });

  it('rejects without latching when there is no authenticated keycloak session', async () => {
    const kc = makeKc({ authenticated: false });
    (ensureKeycloak as any).mockResolvedValue(kc);
    const mod = await load();

    await expect(mod.getAuthToken()).rejects.toBeInstanceOf(mod.SessionExpiredError);
    expect(mod.isSessionExpired()).toBe(false);
    expect(kc.updateToken).not.toHaveBeenCalled();
  });

  it('resetAuthTokenState clears the latch so a fresh sign-in can proceed', async () => {
    const kc = makeKc({ updateToken: vi.fn().mockRejectedValue(new Error('refresh failed')) });
    (ensureKeycloak as any).mockResolvedValue(kc);
    const mod = await load();

    await expect(mod.getAuthToken()).rejects.toBeInstanceOf(mod.SessionExpiredError);
    expect(mod.isSessionExpired()).toBe(true);

    mod.resetAuthTokenState();
    expect(mod.isSessionExpired()).toBe(false);

    kc.updateToken.mockResolvedValue(true);
    await expect(mod.getAuthToken()).resolves.toBe('fresh-token');
  });
});

describe('installAuthToken', () => {
  it('registers getAuthToken as the api-client provider and the keycloak expiry handler, once', async () => {
    (ensureKeycloak as any).mockResolvedValue(makeKc());
    const { installAuthToken, getAuthToken } = await load();

    installAuthToken();
    installAuthToken();

    expect(setTokenProvider).toHaveBeenCalledTimes(1);
    expect(setTokenProvider).toHaveBeenCalledWith(getAuthToken);
    expect(setTokenExpiredHandler).toHaveBeenCalledTimes(1);
  });
});
