import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { UsersService } from '../../users/users.service';
import { SupportAccessReader } from '../support-access-reader.service';

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
      roles: [{ role: 'DISTRIBUTOR_ADMIN' }],
      organisation: { id: 'org-1', name: 'Vine & Co' },
    },
  ],
};

const mockUsersService = {
  findByKeycloakId: jest.fn(),
  linkKeycloakId: jest.fn(),
};

const mockSupportAccess = {
  findActiveForUser: jest.fn(),
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
        { provide: SupportAccessReader, useValue: mockSupportAccess },
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
        organisationIds: ['org-1'],
        memberships: [{ organisationId: 'org-1', roles: ['DISTRIBUTOR_ADMIN'] }],
        opsSession: false,
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
      expect(result.organisationIds).toEqual([]);
      expect(result.memberships).toEqual([]);
    });

    it('resolves membership roles from the legacy role column when no MembershipRole rows exist yet', async () => {
      // Live-rollout safety net: correctness must not depend on the
      // db:membership-roles:backfill script having run yet.
      const preBackfillUser = {
        ...mockUser,
        memberships: [{ role: 'DISTRIBUTOR_ADMIN', organisationId: 'org-1', roles: [], organisation: { id: 'org-1' } }],
      };
      mockUsersService.findByKeycloakId.mockResolvedValue(preBackfillUser);

      const result = await strategy.validate({ sub: 'kc-sub-abc' });
      expect(result.memberships).toEqual([{ organisationId: 'org-1', roles: ['DISTRIBUTOR_ADMIN'] }]);
    });

    it('never defaults to the Stocdup PLATFORM organisation for an operator who also works at a wholesaler', async () => {
      mockUsersService.findByKeycloakId.mockResolvedValue({
        ...mockUser,
        memberships: [
          { role: 'PLATFORM_ADMIN', organisationId: 'stocdup', roles: [], organisation: { id: 'stocdup', type: 'PLATFORM' } },
          { role: 'DISTRIBUTOR_ADMIN', organisationId: 'org-1', roles: [], organisation: { id: 'org-1', type: 'DISTRIBUTOR' } },
        ],
      });

      const result = await strategy.validate({ sub: 'kc-sub-abc' });
      expect(result.organisationId).toBe('org-1');
      expect(result.role).toBe('DISTRIBUTOR_ADMIN');
      expect(result.organisationIds).toEqual(['stocdup', 'org-1']);
    });

    describe('support grants (ADR-078)', () => {
      const grant = { id: 'grant-1', distributorId: 'dist-9', role: 'SUPPORT', expiresAt: new Date('2026-10-23T16:00:00Z') };

      beforeEach(() => {
        mockUsersService.findByKeycloakId.mockResolvedValue(mockUser);
        mockSupportAccess.findActiveForUser.mockResolvedValue([grant]);
      });

      it('adds active grants as memberships for an ops-client token at authenticator level', async () => {
        const result = await strategy.validate({ sub: 'kc-sub-abc', azp: 'stocdup-ops', acr: '2' });

        expect(result.opsSession).toBe(true);
        expect(result.organisationIds).toEqual(['org-1', 'dist-9']);
        expect(result.memberships).toContainEqual({
          organisationId: 'dist-9',
          roles: ['SUPPORT'],
          supportGrantId: 'grant-1',
          expiresAt: grant.expiresAt,
        });
      });

      it('never makes a grant the default organisation', async () => {
        const result = await strategy.validate({ sub: 'kc-sub-abc', azp: 'stocdup-ops', acr: '2' });
        expect(result.organisationId).toBe('org-1');
      });

      it.each([
        ['the admin client', { azp: 'wholo-admin', acr: '2' }],
        ['a password-only sign-in', { azp: 'stocdup-ops', acr: '1' }],
        ['a token with no acr', { azp: 'stocdup-ops' }],
        ['a token with no azp', { acr: '2' }],
      ])('ignores grants for %s', async (_label, claims) => {
        const result = await strategy.validate({ sub: 'kc-sub-abc', ...claims });

        expect(result.opsSession).toBe(false);
        expect(result.organisationIds).toEqual(['org-1']);
        expect(mockSupportAccess.findActiveForUser).not.toHaveBeenCalled();
      });

      it('skips a grant for an organisation the user is already a member of', async () => {
        mockSupportAccess.findActiveForUser.mockResolvedValue([{ ...grant, distributorId: 'org-1' }]);
        const result = await strategy.validate({ sub: 'kc-sub-abc', azp: 'stocdup-ops', acr: '2' });
        expect(result.organisationIds).toEqual(['org-1']);
      });
    });
  });
});
