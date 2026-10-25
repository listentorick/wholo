import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
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

  async function build(appMode?: string) {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: ApiClientService, useValue: api },
        { provide: ConfigService, useValue: { get: (key: string) => (key === 'APP_MODE' ? appMode : undefined) } },
      ],
    }).compile();
    return module.get(AuthService);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await build();
  });

  describe('me', () => {
    it('asks for the selected organisation when there is one', async () => {
      api.get.mockResolvedValue({});
      await service.me('token-1', 'dist-b');
      expect(api.get).toHaveBeenCalledWith('/auth/me?organisationId=dist-b', 'token-1');
    });
  });

  describe('session in the Ops app (ADR-078)', () => {
    beforeEach(async () => {
      service = await build('ops');
    });

    it('is ACTIVE for a Stocdup platform user', async () => {
      const user = { id: 'op', organisationType: 'PLATFORM' };
      api.get.mockResolvedValue(user);
      await expect(service.session('token-1', principal)).resolves.toEqual({ status: 'ACTIVE', user });
    });

    it('is ACTIVE as the operator for an operator who also works at a wholesaler', async () => {
      const operator = { id: 'op', organisationType: 'PLATFORM' };
      api.get.mockImplementation(async (path: string) =>
        path.includes('organisationType=PLATFORM') ? operator : { id: 'op', organisationType: 'DISTRIBUTOR' },
      );
      await expect(service.session('token-1', principal)).resolves.toEqual({ status: 'ACTIVE', user: operator });
    });

    it('is ACCESS_DENIED for a distributor user', async () => {
      const user = { id: 'u1', organisationType: 'DISTRIBUTOR' };
      api.get.mockResolvedValue(user);
      await expect(service.session('token-1', principal)).resolves.toEqual({ status: 'ACCESS_DENIED', user });
    });

    it('never offers distributor onboarding', async () => {
      api.get.mockRejectedValue(new HttpException('No Wholo user found', 401));
      await expect(service.session('token-1', principal)).resolves.toEqual({ status: 'ACCESS_DENIED' });
    });
  });

  describe('session', () => {
    it('returns ACTIVE with the profile when upstream /auth/me succeeds for a distributor', async () => {
      const user = { id: 'u1', email: 'ada@acme.com', role: 'DISTRIBUTOR_ADMIN', organisationType: 'DISTRIBUTOR' };
      api.get.mockResolvedValue(user);

      await expect(service.session('token-1', principal)).resolves.toEqual({ status: 'ACTIVE', user });
      expect(api.get).toHaveBeenCalledWith('/auth/me?organisationType=DISTRIBUTOR', 'token-1');
    });

    it('returns ACCESS_DENIED when the resolved profile is a trade customer', async () => {
      const user = { id: 'u1', email: 'ada@acme.com', role: 'TRADE_CUSTOMER', organisationType: 'TRADE_CUSTOMER' };
      api.get.mockResolvedValue(user);

      await expect(service.session('token-1', principal)).resolves.toEqual({ status: 'ACCESS_DENIED', user });
    });

    it('returns ACCESS_DENIED when the resolved profile has no membership at all', async () => {
      const user = { id: 'u1', email: 'ada@acme.com', role: undefined, organisationType: undefined };
      api.get.mockResolvedValue(user);

      await expect(service.session('token-1', principal)).resolves.toEqual({ status: 'ACCESS_DENIED', user });
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
