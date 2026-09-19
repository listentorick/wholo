import { ConfigService } from '@nestjs/config';
import { KeycloakAdminService } from './keycloak-admin.service';

const res = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, statusText: `HTTP ${status}`, json: async () => body }) as unknown as Response;

describe('KeycloakAdminService', () => {
  let service: KeycloakAdminService;
  let fetchMock: jest.Mock;
  let env: Record<string, string | undefined>;
  const calls = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`);

  const build = () =>
    new KeycloakAdminService({
      get: (key: string, fallback?: string) => env[key] ?? fallback,
    } as unknown as ConfigService);

  beforeEach(() => {
    env = { KEYCLOAK_URL: 'http://kc.test/', KEYCLOAK_REALM: 'wholo', KEYCLOAK_ADMIN_CLIENT_SECRET: 's3cret' };
    fetchMock = jest.fn(async (url: string, init?: { method?: string }) => {
      if (String(url).endsWith('/protocol/openid-connect/token')) return res(200, { access_token: 'tok-1', expires_in: 300 });
      if (init?.method === 'PUT') return res(204);
      return res(204); // logout
    });
    (global as any).fetch = fetchMock;
    service = build();
  });

  it('disables the user and ends their sessions, authenticating as the service account', async () => {
    await service.disableUser('kc-123');

    expect(calls()).toEqual([
      'POST http://kc.test/realms/wholo/protocol/openid-connect/token',
      'PUT http://kc.test/admin/realms/wholo/users/kc-123',
      'POST http://kc.test/admin/realms/wholo/users/kc-123/logout',
    ]);
    const put = fetchMock.mock.calls[1][1];
    expect(JSON.parse(put.body)).toEqual({ enabled: false });
    expect(put.headers.Authorization).toBe('Bearer tok-1');
    const tokenBody = String(fetchMock.mock.calls[0][1].body);
    expect(tokenBody).toContain('grant_type=client_credentials');
    expect(tokenBody).toContain('client_id=wholo-api-admin');
  });

  it('reuses its access token across calls rather than logging in each time', async () => {
    await service.disableUser('a');
    await service.disableUser('b');
    expect(calls().filter((c) => c.endsWith('/token'))).toHaveLength(1);
  });

  it('treats a user Keycloak no longer knows as already disabled', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/token') ? res(200, { access_token: 't', expires_in: 300 }) : res(404),
    );
    await expect(service.disableUser('gone')).resolves.toBeUndefined();
  });

  it('fails loudly (so the job retries) when Keycloak refuses', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/token') ? res(200, { access_token: 't', expires_in: 300 }) : res(500),
    );
    await expect(service.disableUser('kc-1')).rejects.toThrow('Keycloak could not disable user kc-1: 500');
  });

  it('fails loudly when the admin client cannot authenticate', async () => {
    fetchMock.mockResolvedValue(res(401));
    await expect(service.disableUser('kc-1')).rejects.toThrow('obtain a Keycloak admin token');
  });

  it('refuses to run without a client secret, and says why', async () => {
    delete env.KEYCLOAK_ADMIN_CLIENT_SECRET;
    await expect(build().disableUser('kc-1')).rejects.toThrow('KEYCLOAK_ADMIN_CLIENT_SECRET is not set');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-authenticates after a 401 from the admin API', async () => {
    let putCalls = 0;
    fetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (String(url).endsWith('/token')) return res(200, { access_token: `tok-${fetchMock.mock.calls.length}`, expires_in: 300 });
      if (init?.method === 'PUT' && putCalls++ === 0) return res(401);
      return res(204);
    });
    await expect(service.disableUser('kc-1')).rejects.toThrow('401');
    await expect(service.disableUser('kc-1')).resolves.toBeUndefined();
    expect(calls().filter((c) => c.endsWith('/token'))).toHaveLength(2);
  });
});
