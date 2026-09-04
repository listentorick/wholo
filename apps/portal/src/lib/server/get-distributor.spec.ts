import { describe, expect, it, vi, afterEach } from 'vitest';
import { getDistributorForSlug } from './get-distributor';

describe('getDistributorForSlug', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null on a 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    expect(await getDistributorForSlug('missing-slug')).toBeNull();
  });

  it('returns the parsed distributor on success', async () => {
    const distributor = { id: 'd1', slug: 'winos', name: 'Winos Co' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => distributor }),
    );

    expect(await getDistributorForSlug('winos')).toEqual(distributor);
  });

  it('throws on a non-404 failure rather than reporting "not found"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    await expect(getDistributorForSlug('winos')).rejects.toThrow();
  });

  it('requests the central API using CENTRAL_API_URL, url-encoding the slug', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('CENTRAL_API_URL', 'http://wholo-api:3001');

    await getDistributorForSlug('acme foods');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://wholo-api:3001/api/v1/distributors/acme%20foods',
      { cache: 'no-store' },
    );
  });
});
