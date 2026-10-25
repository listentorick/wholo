import { afterEach, describe, expect, it, vi } from 'vitest';

// apiFetch is the HTTP boundary; it answers with the request it was given.
vi.mock('@wholo/admin-api-client', () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => ({ path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })),
}));

import { opsApi } from './api';

describe('opsApi', () => {
  afterEach(() => vi.clearAllMocks());

  it('reads the Ops BFF’s stats and the caller’s grants', async () => {
    await expect(opsApi.stats()).resolves.toMatchObject({ path: '/api/v1/ops/stats', method: 'GET' });
    await expect(opsApi.myGrants()).resolves.toMatchObject({ path: '/api/v1/ops/grants', method: 'GET' });
  });

  it('lists wholesalers with only the search and filter given', async () => {
    await expect(opsApi.distributors()).resolves.toMatchObject({ path: '/api/v1/ops/distributors' });
    await expect(opsApi.distributors({ q: 'vine & co', filter: 'mine' })).resolves.toMatchObject({
      path: '/api/v1/ops/distributors?q=vine+%26+co&filter=mine',
    });
  });

  it('opens access with the reason and length, never naming a user', async () => {
    await expect(opsApi.openAccess('dist-1', 'Price lists', 240)).resolves.toEqual({
      path: '/api/v1/ops/grants',
      method: 'POST',
      body: { distributorId: 'dist-1', reason: 'Price lists', durationMinutes: 240 },
    });
  });

  it('ends access, encoding the ids', async () => {
    await expect(opsApi.endAccess('dist/1', 'g-1')).resolves.toMatchObject({ path: '/api/v1/ops/grants/dist%2F1/g-1', method: 'DELETE' });
  });
});
