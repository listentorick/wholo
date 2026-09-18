import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { ApiClientService } from '../../api-client/api-client.service';

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(() => jest.fn()),
}));

const mockProfile = {
  id: 'seed-customer-1',
  email: 'peter@blackbird.com',
  roles: ['TRADE_CUSTOMER'],
  permissions: ['catalogue:read'],
  organisationId: 'seed-customer-org-1',
};

const mockReq = {
  headers: { authorization: 'Bearer test-token-abc' },
} as any;

const mockPayload = { sub: 'kc-seed-customer-1', email: 'peter@blackbird.com' };

describe('JwtStrategy (portal-api)', () => {
  let strategy: JwtStrategy;
  let mockApiClient: { get: jest.Mock };

  beforeEach(async () => {
    mockApiClient = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string, fallback?: string) => fallback ?? '') },
        },
        { provide: ApiClientService, useValue: mockApiClient },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('returns user context with organisationId on successful profile fetch', async () => {
    mockApiClient.get.mockResolvedValueOnce(mockProfile);

    const result = await strategy.validate(mockReq, mockPayload);

    expect(result).toEqual({
      sub: 'seed-customer-1',
      email: 'peter@blackbird.com',
      token: 'test-token-abc',
      organisationId: 'seed-customer-org-1',
      roles: ['TRADE_CUSTOMER'],
      permissions: ['catalogue:read'],
    });
    expect(mockApiClient.get).toHaveBeenCalledWith('/auth/me', 'test-token-abc');
  });

  it('accepts a DISTRIBUTOR_ADMIN profile too — no organisationType gate (ADR-053)', async () => {
    mockApiClient.get.mockResolvedValueOnce({
      id: 'seed-admin-1',
      email: 'james@vineandco.com',
      roles: ['DISTRIBUTOR_ADMIN'],
      permissions: ['order-as:initiate'],
      organisationId: 'seed-distributor-1',
    });

    const result = await strategy.validate(mockReq, mockPayload);

    expect(result.roles).toEqual(['DISTRIBUTOR_ADMIN']);
    expect(result.organisationId).toBe('seed-distributor-1');
  });

  it('throws UnauthorizedException when apps/api returns an error response', async () => {
    const err = new Error('Unauthorized') as any;
    err.status = 401;
    mockApiClient.get.mockRejectedValueOnce(err);

    await expect(strategy.validate(mockReq, mockPayload)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException on network error (apps/api unreachable)', async () => {
    mockApiClient.get.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(strategy.validate(mockReq, mockPayload)).rejects.toThrow(UnauthorizedException);
  });

  it('sets token to undefined when no authorization header', async () => {
    mockApiClient.get.mockResolvedValueOnce(mockProfile);
    const req = { headers: {} } as any;

    const result = await strategy.validate(req, mockPayload);

    expect(result.token).toBeUndefined();
    expect(mockApiClient.get).toHaveBeenCalledWith('/auth/me', undefined);
  });
});
