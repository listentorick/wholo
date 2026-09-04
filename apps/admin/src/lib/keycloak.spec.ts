import { vi, describe, it, expect, beforeEach } from 'vitest';

const { KeycloakCtor, kcInstance, initMock } = vi.hoisted(() => {
  const initMock = vi.fn().mockResolvedValue(true);
  const kcInstance: any = {
    authenticated: true,
    token: 'kc-token',
    init: initMock,
    updateToken: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  };
  const KeycloakCtor = vi.fn(() => kcInstance);
  return { KeycloakCtor, kcInstance, initMock };
});

vi.mock('keycloak-js', () => ({ default: KeycloakCtor }));

type KeycloakModule = typeof import('./keycloak');

async function load(): Promise<KeycloakModule> {
  vi.resetModules();
  return import('./keycloak');
}

beforeEach(() => {
  vi.clearAllMocks();
  initMock.mockResolvedValue(true);
  delete kcInstance.onTokenExpired;
  delete (window as any).__kc;
});

describe('ensureKeycloak', () => {
  it('constructs and initialises keycloak-js exactly once across concurrent callers', async () => {
    const { ensureKeycloak } = await load();

    const [a, b, c] = await Promise.all([ensureKeycloak(), ensureKeycloak(), ensureKeycloak()]);

    expect(KeycloakCtor).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(kcInstance);
    expect(b).toBe(kcInstance);
    expect(c).toBe(kcInstance);
  });

  it('assigns onTokenExpired before init() so keycloak-js arms its refresh timer', async () => {
    initMock.mockImplementationOnce(() => {
      expect(typeof kcInstance.onTokenExpired).toBe('function');
      return Promise.resolve(true);
    });
    const { ensureKeycloak } = await load();
    await ensureKeycloak();
    expect(initMock).toHaveBeenCalled();
  });

  it('routes the keycloak-js expiry callback through the late-bound handler', async () => {
    const { ensureKeycloak, setTokenExpiredHandler } = await load();
    await ensureKeycloak();

    const handler = vi.fn();
    setTokenExpiredHandler(handler);
    kcInstance.onTokenExpired();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('getKeycloak returns the instance only after init has resolved', async () => {
    const { ensureKeycloak, getKeycloak } = await load();
    expect(getKeycloak()).toBeNull();
    await ensureKeycloak();
    expect(getKeycloak()).toBe(kcInstance);
  });
});
