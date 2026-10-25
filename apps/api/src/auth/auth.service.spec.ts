import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { ForbiddenException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_PERMISSIONS } from './role-permissions';

const mockUser = {
  id: 'user-1',
  email: 'james@vineandco.com',
  firstName: 'James',
  lastName: 'Vine',
  memberships: [
    {
      role: 'DISTRIBUTOR_ADMIN',
      organisationId: 'org-1',
      roles: [{ role: 'DISTRIBUTOR_ADMIN' }],
      organisation: { id: 'org-1', name: 'Vine & Co', type: 'DISTRIBUTOR', distributorSettings: { currencyCode: 'GBP' } },
    },
  ],
};

const mockUsersService = {
  findById: jest.fn(),
};

const mockPrisma = {
  organisation: { findUnique: jest.fn() },
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: PrismaService, useValue: mockPrisma },
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
        roles: ['DISTRIBUTOR_ADMIN'],
        permissions: ROLE_PERMISSIONS['DISTRIBUTOR_ADMIN'],
        organisationId: 'org-1',
        organisationName: 'Vine & Co',
        organisationType: 'DISTRIBUTOR',
        organisationCurrencyCode: 'GBP',
        access: { kind: 'MEMBER' },
      });
    });

    it('returns null when user not found', async () => {
      mockUsersService.findById.mockResolvedValue(null);
      const result = await service.getProfile('missing-id');
      expect(result).toBeNull();
    });

    it('returns empty roles/permissions and undefined organisationId when user has no memberships', async () => {
      mockUsersService.findById.mockResolvedValue({ ...mockUser, memberships: [] });
      const result = await service.getProfile('user-1');
      expect(result?.roles).toEqual([]);
      expect(result?.permissions).toEqual([]);
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
            roles: [{ role: 'TRADE_CUSTOMER' }],
            organisation: { id: 'org-2', name: 'Blackbird Restaurant', type: 'TRADE_CUSTOMER' },
          },
        ],
      };
      mockUsersService.findById.mockResolvedValue(tradeCustomerUser);
      const result = await service.getProfile('user-1');
      expect(result).toMatchObject({
        roles: ['TRADE_CUSTOMER'],
        permissions: ROLE_PERMISSIONS['TRADE_CUSTOMER'],
        organisationId: 'org-2',
        organisationType: 'TRADE_CUSTOMER',
      });
      expect(result?.organisationCurrencyCode).toBeUndefined();
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
            roles: [{ role: 'TRADE_CUSTOMER' }],
            organisation: { id: 'org-2', name: 'Blackbird Restaurant', type: 'TRADE_CUSTOMER' },
          },
          {
            role: 'DISTRIBUTOR_ADMIN',
            organisationId: 'org-1',
            roles: [{ role: 'DISTRIBUTOR_ADMIN' }],
            organisation: { id: 'org-1', name: 'Vine & Co', type: 'DISTRIBUTOR' },
          },
        ],
      };
      mockUsersService.findById.mockResolvedValue(multiMembershipUser);
      const result = await service.getProfile('user-1');
      expect(result).toMatchObject({
        roles: ['DISTRIBUTOR_ADMIN'],
        organisationId: 'org-1',
        organisationType: 'DISTRIBUTOR',
      });
    });

    describe('an operator who also works at a wholesaler (ADR-078)', () => {
      const operator = {
        ...mockUser,
        memberships: [
          {
            role: 'DISTRIBUTOR_ADMIN',
            organisationId: 'org-1',
            roles: [{ role: 'DISTRIBUTOR_ADMIN' }],
            organisation: { id: 'org-1', name: 'Vine & Co', type: 'DISTRIBUTOR' },
          },
          {
            role: 'PLATFORM_ADMIN',
            organisationId: 'stocdup',
            roles: [{ role: 'PLATFORM_ADMIN' }],
            organisation: { id: 'stocdup', name: 'Stocdup', type: 'PLATFORM' },
          },
        ],
      };

      beforeEach(() => mockUsersService.findById.mockResolvedValue(operator));

      it('gets the Stocdup membership when the Ops app asks for PLATFORM', async () => {
        const result = await service.getProfile('user-1', { organisationType: 'PLATFORM' as never });
        expect(result).toMatchObject({ organisationId: 'stocdup', organisationType: 'PLATFORM', roles: ['PLATFORM_ADMIN'] });
      });

      it('gets the wholesaler when the admin app asks for DISTRIBUTOR', async () => {
        const result = await service.getProfile('user-1', { organisationType: 'DISTRIBUTOR' as never });
        expect(result).toMatchObject({ organisationId: 'org-1', organisationType: 'DISTRIBUTOR' });
      });

      it('falls back to the usual pick when the caller holds nothing of the asked-for kind', async () => {
        const result = await service.getProfile('user-1', { organisationType: 'TRADE_CUSTOMER' as never });
        expect(result).toMatchObject({ organisationId: 'org-1', organisationType: 'DISTRIBUTOR' });
      });
    });

    it('resolves roles/permissions from the legacy role column when no MembershipRole rows exist yet', async () => {
      // Live-rollout safety net: correctness must not depend on the
      // db:membership-roles:backfill script having run yet.
      const preBackfillUser = {
        ...mockUser,
        memberships: [
          {
            role: 'DISTRIBUTOR_ADMIN',
            organisationId: 'org-1',
            roles: [],
            organisation: { id: 'org-1', name: 'Vine & Co', type: 'DISTRIBUTOR', distributorSettings: { currencyCode: 'GBP' } },
          },
        ],
      };
      mockUsersService.findById.mockResolvedValue(preBackfillUser);
      const result = await service.getProfile('user-1');
      expect(result?.roles).toEqual(['DISTRIBUTOR_ADMIN']);
      expect(result?.permissions).toEqual(ROLE_PERMISSIONS['DISTRIBUTOR_ADMIN']);
    });
  });

  describe('getProfile with a selected organisation (ADR-078)', () => {
    const expiresAt = new Date('2026-10-23T16:00:00Z');
    const grantClaim = { organisationId: 'dist-9', roles: ['SUPPORT'], supportGrantId: 'grant-1', expiresAt };

    beforeEach(() => {
      mockUsersService.findById.mockResolvedValue(mockUser);
    });

    it('scopes to an organisation the user is a member of', async () => {
      const result = await service.getProfile('user-1', { organisationId: 'org-1' });
      expect(result).toMatchObject({ organisationId: 'org-1', roles: ['DISTRIBUTOR_ADMIN'], access: { kind: 'MEMBER' } });
    });

    it('scopes to an organisation reached through an active support grant, with SUPPORT permissions only', async () => {
      mockPrisma.organisation.findUnique.mockResolvedValue({ id: 'dist-9', name: 'Harbour Cellars', type: 'DISTRIBUTOR', distributorSettings: { currencyCode: 'GBP' } });

      const result = await service.getProfile('user-1', { organisationId: 'dist-9', memberships: [grantClaim as never] });

      expect(result).toMatchObject({
        organisationId: 'dist-9',
        organisationName: 'Harbour Cellars',
        organisationType: 'DISTRIBUTOR',
        roles: ['SUPPORT'],
        permissions: ROLE_PERMISSIONS['SUPPORT'],
        access: { kind: 'SUPPORT', grantId: 'grant-1', expiresAt },
      });
    });

    it('refuses an organisation the user neither belongs to nor holds a grant for', async () => {
      await expect(service.getProfile('user-1', { organisationId: 'dist-other', memberships: [grantClaim as never] })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses when the per-request memberships carry no grant (not an ops session)', async () => {
      await expect(service.getProfile('user-1', { organisationId: 'dist-9', memberships: [] })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
