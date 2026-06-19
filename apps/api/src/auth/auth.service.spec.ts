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
      organisation: { id: 'org-1', name: 'Vine & Co' },
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
    });
  });
});
