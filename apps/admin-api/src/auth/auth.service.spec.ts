import { Test } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiClientService } from '../api-client/api-client.service';
import type { KeycloakPrincipal } from './strategies/keycloak-jwt.strategy';

const principal: KeycloakPrincipal = {
  sub: 'kc-1',
  email: 'ada@acme.com',
  given_name: 'Ada',
  family_name: 'Acme',
  token: 'token-1',
};

describe('AuthService', () => {
  let service: AuthService;
  const api = { get: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [AuthService, { provide: ApiClientService, useValue: api }],
    }).compile();
    service = module.get(AuthService);
  });

  describe('session', () => {
    it('returns ACTIVE with the profile when upstream /auth/me succeeds', async () => {
      const user = { id: 'u1', email: 'ada@acme.com', role: 'DISTRIBUTOR_ADMIN' };
      api.get.mockResolvedValue(user);

      await expect(service.session('token-1', principal)).resolves.toEqual({ status: 'ACTIVE', user });
      expect(api.get).toHaveBeenCalledWith('/auth/me', 'token-1');
    });

    it('returns ONBOARDING_REQUIRED with token identity when upstream replies 401', async () => {
      api.get.mockRejectedValue(new HttpException('No Wholo user found', 401));

      await expect(service.session('token-1', principal)).resolves.toEqual({
        status: 'ONBOARDING_REQUIRED',
        identity: { email: 'ada@acme.com', firstName: 'Ada', lastName: 'Acme' },
      });
    });

    it('rethrows non-401 upstream failures', async () => {
      api.get.mockRejectedValue(new HttpException('upstream down', 503));

      await expect(service.session('token-1', principal)).rejects.toThrow('upstream down');
    });
  });
});
