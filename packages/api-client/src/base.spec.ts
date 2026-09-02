import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, setTokenProvider } from './base';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiFetch token provider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    // jsdom-free: base.ts guards `typeof sessionStorage`, so leave it undefined
    // unless a test opts in.
  });

  afterEach(() => {
    setTokenProvider(null);
    vi.unstubAllGlobals();
  });

  function lastHeaders(): Record<string, string> {
    return fetchMock.mock.calls[0][1].headers as Record<string, string>;
  }

  it('obtains the bearer from the registered provider when no explicit token is passed', async () => {
    const provider = vi.fn().mockResolvedValue('fresh-token');
    setTokenProvider(provider);

    await apiFetch('/api/v1/thing');

    expect(provider).toHaveBeenCalledTimes(1);
    expect(lastHeaders()['Authorization']).toBe('Bearer fresh-token');
  });

  it('prefers an explicit token over the provider', async () => {
    const provider = vi.fn().mockResolvedValue('provider-token');
    setTokenProvider(provider);

    await apiFetch('/api/v1/thing', { token: 'explicit-token' });

    expect(provider).not.toHaveBeenCalled();
    expect(lastHeaders()['Authorization']).toBe('Bearer explicit-token');
  });

  it('propagates a provider rejection and never calls fetch', async () => {
    class SessionExpiredError extends Error {}
    setTokenProvider(vi.fn().mockRejectedValue(new SessionExpiredError('expired')));

    await expect(apiFetch('/api/v1/thing')).rejects.toBeInstanceOf(SessionExpiredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never consults the provider for an anonymous request', async () => {
    const provider = vi.fn().mockResolvedValue('fresh-token');
    setTokenProvider(provider);

    await apiFetch('/api/v1/distributors/acme', { anonymous: true });

    expect(provider).not.toHaveBeenCalled();
    expect(lastHeaders()['Authorization']).toBeUndefined();
  });

  it('sends no Authorization header once the provider is cleared', async () => {
    setTokenProvider(null);
    await apiFetch('/api/v1/public');
    expect(lastHeaders()['Authorization']).toBeUndefined();
  });

  it('attaches X-Order-As-Session alongside the freshly-provided bearer', async () => {
    setTokenProvider(vi.fn().mockResolvedValue('fresh-token'));
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => (k === 'orderAs_session' ? 'order-as-session-token' : null),
    });

    await apiFetch('/api/v1/thing');

    const headers = lastHeaders();
    expect(headers['Authorization']).toBe('Bearer fresh-token');
    expect(headers['X-Order-As-Session']).toBe('order-as-session-token');
  });
});
