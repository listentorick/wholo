import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { ApiClientService } from '../api-client/api-client.service';

const mockProfile = {
  id: 'user-1',
  email: 'peter@blackbird.com',
  role: 'TRADE_CUSTOMER',
  organisationId: 'org-blackbird',
};

const mockApiClient = {
  get: jest.fn(),
};

describe('AuthService (portal-api)', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: ApiClientService, useValue: mockApiClient },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('me', () => {
    it('proxies GET /auth/me with the bearer token', async () => {
      mockApiClient.get.mockResolvedValue(mockProfile);

      const result = await service.me('some-token');

      expect(mockApiClient.get).toHaveBeenCalledWith('/auth/me', 'some-token');
      expect(result).toEqual(mockProfile);
    });
  });
});
