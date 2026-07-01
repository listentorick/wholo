import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { ApiClientService } from '../../api-client/api-client.service';

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(() => jest.fn()),
}));

const mockProfile = {
  id: 'seed-admin-1',
  email: 'james@vineandco.com',
  role: 'DISTRIBUTOR_ADMIN',
  organisationId: 'seed-distributor-1',
};

const mockReq = {
  headers: { authorization: 'Bearer test-token-abc' },
};

const mockPayload = { sub: 'kc-seed-admin-1', email: 'james@vineandco.com' };

describe('JwtStrategy (admin-api)', () => {
  let strategy: JwtStrategy;
  let mockApiClient: { get: jest.Mock };

  beforeEach(async () => {
    mockApiClient = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              const map: Record<string, string> = {
                KEYCLOAK_URL: 'http://keycloak:8080',
                KEYCLOAK_REALM: 'wholo',
              };
              return map[key] ?? fallback;
            }),
          },
        },
        { provide: ApiClientService, useValue: mockApiClient },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('returns user context with organisationId on successful profile fetch', async () => {
    mockApiClient.get.mockResolvedValueOnce(mockProfile);

    const result = await strategy.validate(mockReq as any, mockPayload);

    expect(result).toEqual({
      sub: 'seed-admin-1',
      email: 'james@vineandco.com',
      token: 'test-token-abc',
      organisationId: 'seed-distributor-1',
      role: 'DISTRIBUTOR_ADMIN',
    });
    expect(mockApiClient.get).toHaveBeenCalledWith('/auth/me', 'test-token-abc');
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
});
