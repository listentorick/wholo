import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { ApiClientService } from '../../api-client/api-client.service';

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(() => jest.fn()),
}));

const mockProfile = {
  id: 'seed-admin-1',
  email: 'james@vineandco.com',
  roles: ['DISTRIBUTOR_ADMIN'],
  permissions: ['order-as:initiate'],
  organisationId: 'seed-distributor-1',
  organisationType: 'DISTRIBUTOR',
  access: { kind: 'MEMBER' },
};

const mockReq = {
  headers: { authorization: 'Bearer test-token-abc' },
};

const mockPayload = { sub: 'kc-seed-admin-1', email: 'james@vineandco.com' };

async function build(mockApiClient: { get: jest.Mock }, appMode?: string): Promise<JwtStrategy> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      JwtStrategy,
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string, fallback?: string) => {
            const map: Record<string, string | undefined> = {
              KEYCLOAK_URL: 'http://keycloak:8080',
              KEYCLOAK_REALM: 'wholo',
              APP_MODE: appMode,
            };
            return map[key] ?? fallback;
          }),
        },
      },
      { provide: ApiClientService, useValue: mockApiClient },
    ],
  }).compile();
  return module.get<JwtStrategy>(JwtStrategy);
}

describe('JwtStrategy (admin-api)', () => {
  let strategy: JwtStrategy;
  let mockApiClient: { get: jest.Mock };

  beforeEach(async () => {
    mockApiClient = { get: jest.fn() };
    strategy = await build(mockApiClient);
  });

  it('returns user context with organisationId on successful profile fetch', async () => {
    mockApiClient.get.mockResolvedValueOnce(mockProfile);

    const result = await strategy.validate(mockReq as any, mockPayload);

    expect(result).toEqual({
      sub: 'seed-admin-1',
      email: 'james@vineandco.com',
      token: 'test-token-abc',
      organisationId: 'seed-distributor-1',
      roles: ['DISTRIBUTOR_ADMIN'],
      permissions: ['order-as:initiate'],
      access: { kind: 'MEMBER' },
    });
    expect(mockApiClient.get).toHaveBeenCalledWith('/auth/me?organisationType=DISTRIBUTOR', 'test-token-abc');
  });

  it('throws UnauthorizedException when apps/api returns an error response', async () => {
    const err = new Error('Unauthorized') as any;
    err.status = 401;
    mockApiClient.get.mockRejectedValueOnce(err);

    await expect(strategy.validate(mockReq as any, mockPayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException on network error (apps/api unreachable)', async () => {
    mockApiClient.get.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(strategy.validate(mockReq as any, mockPayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException for a trade-customer profile (ADR-053)', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      ...mockProfile,
      roles: ['TRADE_CUSTOMER'],
      permissions: ['catalogue:read'],
      organisationType: 'TRADE_CUSTOMER',
    });

    await expect(strategy.validate(mockReq as any, mockPayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when organisationType is missing (no membership at all)', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      ...mockProfile,
      roles: [],
      permissions: [],
      organisationId: undefined,
      organisationType: undefined,
    });

    await expect(strategy.validate(mockReq as any, mockPayload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('ignores an organisation header — the admin app never selects', async () => {
    mockApiClient.get.mockResolvedValueOnce(mockProfile);
    await strategy.validate({ headers: { ...mockReq.headers, 'x-organisation-id': 'dist-b' } } as any, mockPayload);
    expect(mockApiClient.get).toHaveBeenCalledWith('/auth/me?organisationType=DISTRIBUTOR', 'test-token-abc');
  });

  it('refuses a Stocdup platform profile', async () => {
    mockApiClient.get.mockResolvedValueOnce({ ...mockProfile, organisationType: 'PLATFORM' });
    await expect(strategy.validate(mockReq as any, mockPayload)).rejects.toThrow(UnauthorizedException);
  });
});

describe('JwtStrategy (Ops app, ADR-078)', () => {
  let strategy: JwtStrategy;
  let mockApiClient: { get: jest.Mock };
  const platformProfile = { ...mockProfile, organisationId: 'stocdup', organisationType: 'PLATFORM', roles: ['PLATFORM_ADMIN'] };
  const supportProfile = { ...mockProfile, roles: ['SUPPORT'], access: { kind: 'SUPPORT', grantId: 'g-1', expiresAt: '2026-10-23T16:00:00Z' } };
  const selecting = { headers: { ...mockReq.headers, 'x-organisation-id': 'seed-distributor-1' } };

  beforeEach(async () => {
    mockApiClient = { get: jest.fn() };
    strategy = await build(mockApiClient, 'ops');
  });

  it('admits a platform user with nothing selected', async () => {
    mockApiClient.get.mockResolvedValueOnce(platformProfile);
    const result = await strategy.validate(mockReq as any, mockPayload);
    expect(result.organisationId).toBe('stocdup');
  });

  it('admits an operator who also works at a wholesaler, as the operator', async () => {
    // apps/api answers with whichever membership the path asks for.
    mockApiClient.get.mockImplementation(async (path: string) =>
      path.includes('organisationType=PLATFORM') ? platformProfile : mockProfile,
    );
    const result = await strategy.validate(mockReq as any, mockPayload);
    expect(result).toMatchObject({ organisationId: 'stocdup', roles: ['PLATFORM_ADMIN'] });
  });

  it('refuses a distributor member with nothing selected', async () => {
    mockApiClient.get.mockResolvedValueOnce(mockProfile);
    await expect(strategy.validate(mockReq as any, mockPayload)).rejects.toThrow(UnauthorizedException);
  });

  it('asks apps/api for the selected wholesaler and admits support access to it', async () => {
    mockApiClient.get.mockResolvedValueOnce(supportProfile);
    const result = await strategy.validate(selecting as any, mockPayload);
    expect(mockApiClient.get).toHaveBeenCalledWith('/auth/me?organisationId=seed-distributor-1', 'test-token-abc');
    expect(result).toMatchObject({ organisationId: 'seed-distributor-1', access: { kind: 'SUPPORT' } });
  });

  it('refuses a selected wholesaler reached by membership rather than support access', async () => {
    mockApiClient.get.mockResolvedValueOnce(mockProfile);
    await expect(strategy.validate(selecting as any, mockPayload)).rejects.toThrow(ForbiddenException);
  });

  it('turns a refused selection into 403, so the Ops app can drop it', async () => {
    mockApiClient.get.mockRejectedValueOnce(new HttpException('Not authorized for this organisation', 403));
    await expect(strategy.validate(selecting as any, mockPayload)).rejects.toThrow(ForbiddenException);
  });
});
