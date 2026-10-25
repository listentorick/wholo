import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, apiFetch, setApiErrorListener, setRequestHeadersProvider, setTokenProvider } from './base';

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
});

describe('apiFetch extra headers and error listener', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    setRequestHeadersProvider(null);
    setApiErrorListener(null);
    vi.unstubAllGlobals();
  });

  it('adds the provider’s headers to authenticated requests only', async () => {
    setRequestHeadersProvider(() => ({ 'X-Organisation-Id': 'dist-1' }));

    await apiFetch('/api/v1/thing', { token: 't' });
    await apiFetch('/api/v1/public', { anonymous: true });

    expect(fetchMock.mock.calls[0][1].headers['X-Organisation-Id']).toBe('dist-1');
    expect(fetchMock.mock.calls[1][1].headers['X-Organisation-Id']).toBeUndefined();
  });

  it('tells the listener about a failed request, then throws it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ type: 'about:blank', title: 'Forbidden', status: 403, detail: 'ended' }, 403));
    const listener = vi.fn();
    setApiErrorListener(listener);

    await expect(apiFetch('/api/v1/thing', { token: 't' })).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });
});
