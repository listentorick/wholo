import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

const mockUser = {
  id: 'user-1',
  email: 'james@vineandco.com',
  firstName: 'James',
  lastName: 'Vine',
  memberships: [
    {
      role: 'DISTRIBUTOR_ADMIN',
      organisationId: 'org-1',
      organisation: { id: 'org-1', name: 'Vine & Co', type: 'DISTRIBUTOR' },
    },
  ],
};

const mockUsersService = {
  findById: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('getProfile', () => {
    it('returns full profile when user exists', async () => {
      mockUsersService.findById.mockResolvedValue(mockUser);
      const result = await service.getProfile('user-1');
      expect(result).toEqual({
        id: 'user-1',
        email: 'james@vineandco.com',
        firstName: 'James',
        lastName: 'Vine',
        role: 'DISTRIBUTOR_ADMIN',
        organisationId: 'org-1',
        organisationName: 'Vine & Co',
        organisationType: 'DISTRIBUTOR',
      });
    });

    it('returns null when user not found', async () => {
      mockUsersService.findById.mockResolvedValue(null);
      const result = await service.getProfile('missing-id');
      expect(result).toBeNull();
    });

    it('returns null role and organisationId when user has no memberships', async () => {
      mockUsersService.findById.mockResolvedValue({ ...mockUser, memberships: [] });
      const result = await service.getProfile('user-1');
      expect(result?.role).toBeUndefined();
      expect(result?.organisationId).toBeUndefined();
      expect(result?.organisationName).toBeUndefined();
      expect(result?.organisationType).toBeUndefined();
    });

    it('returns the TRADE_CUSTOMER membership when that is the only one held', async () => {
      const tradeCustomerUser = {
        ...mockUser,
        memberships: [
          {
            role: 'TRADE_CUSTOMER',
            organisationId: 'org-2',
            organisation: { id: 'org-2', name: 'Blackbird Restaurant', type: 'TRADE_CUSTOMER' },
          },
        ],
      };
      mockUsersService.findById.mockResolvedValue(tradeCustomerUser);
      const result = await service.getProfile('user-1');
      expect(result).toMatchObject({
        role: 'TRADE_CUSTOMER',
        organisationId: 'org-2',
        organisationType: 'TRADE_CUSTOMER',
      });
    });

    it('prefers a DISTRIBUTOR membership over a TRADE_CUSTOMER one regardless of array order', async () => {
      // Guards against picking an arbitrary "first" membership (ADR-053) — a user
      // holding both must resolve to the distributor-side one so admin-api's
      // organisationType gate sees it correctly.
      const multiMembershipUser = {
        ...mockUser,
        memberships: [
          {
            role: 'TRADE_CUSTOMER',
            organisationId: 'org-2',
            organisation: { id: 'org-2', name: 'Blackbird Restaurant', type: 'TRADE_CUSTOMER' },
          },
          {
            role: 'DISTRIBUTOR_ADMIN',
            organisationId: 'org-1',
            organisation: { id: 'org-1', name: 'Vine & Co', type: 'DISTRIBUTOR' },
          },
        ],
      };
      mockUsersService.findById.mockResolvedValue(multiMembershipUser);
      const result = await service.getProfile('user-1');
      expect(result).toMatchObject({
        role: 'DISTRIBUTOR_ADMIN',
        organisationId: 'org-1',
        organisationType: 'DISTRIBUTOR',
      });
    });
  });
});
