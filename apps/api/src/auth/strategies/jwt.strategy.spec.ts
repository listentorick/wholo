import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { UsersService } from '../../users/users.service';

jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn().mockReturnValue(jest.fn()),
}));

const mockUser = {
  id: 'wholo-user-1',
  email: 'james@vineandco.com',
  keycloakId: 'kc-sub-abc',
  memberships: [
    {
      role: 'DISTRIBUTOR_ADMIN',
      organisationId: 'org-1',
      organisation: { id: 'org-1', name: 'Vine & Co' },
    },
  ],
};

const mockUsersService = {
  findByKeycloakId: jest.fn(),
  linkKeycloakId: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string, fallback?: string) => fallback ?? ''),
};

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: mockConfig },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  describe('validate', () => {
    it('returns Wholo principal when user found by keycloakId', async () => {
      mockUsersService.findByKeycloakId.mockResolvedValue(mockUser);

      const result = await strategy.validate({ sub: 'kc-sub-abc', email: 'james@vineandco.com' });

      expect(result).toEqual({
        sub: 'wholo-user-1',
        email: 'james@vineandco.com',
        role: 'DISTRIBUTOR_ADMIN',
        organisationId: 'org-1',
      });
      expect(result.sub).toBe('wholo-user-1');
    });

    it('uses Wholo user ID as sub, not the Keycloak UUID', async () => {
      mockUsersService.findByKeycloakId.mockResolvedValue(mockUser);
      const result = await strategy.validate({ sub: 'kc-sub-abc' });
      expect(result.sub).toBe('wholo-user-1');
      expect(result.sub).not.toBe('kc-sub-abc');
    });

    it('JIT-links existing user by email when no keycloakId match', async () => {
      const linkedUser = { ...mockUser, keycloakId: 'new-kc-sub' };
      mockUsersService.findByKeycloakId.mockResolvedValue(null);
      mockUsersService.linkKeycloakId.mockResolvedValue(linkedUser);

      const result = await strategy.validate({ sub: 'new-kc-sub', email: 'james@vineandco.com' });

      expect(mockUsersService.linkKeycloakId).toHaveBeenCalledWith('james@vineandco.com', 'new-kc-sub');
      expect(result.sub).toBe('wholo-user-1');
    });

    it('throws UnauthorizedException when no user found and no email for JIT link', async () => {
      mockUsersService.findByKeycloakId.mockResolvedValue(null);

      await expect(strategy.validate({ sub: 'unknown-sub' })).rejects.toThrow(UnauthorizedException);
      expect(mockUsersService.linkKeycloakId).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when JIT link also returns null', async () => {
      mockUsersService.findByKeycloakId.mockResolvedValue(null);
      mockUsersService.linkKeycloakId.mockResolvedValue(null);

      await expect(
        strategy.validate({ sub: 'unknown-sub', email: 'nobody@example.com' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns null role/organisationId when user has no memberships', async () => {
      const userNoMembership = { ...mockUser, memberships: [] };
      mockUsersService.findByKeycloakId.mockResolvedValue(userNoMembership);

      const result = await strategy.validate({ sub: 'kc-sub-abc' });
      expect(result.role).toBeUndefined();
      expect(result.organisationId).toBeUndefined();
    });
  });
});
