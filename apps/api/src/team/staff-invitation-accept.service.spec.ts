import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { InvitationStatus, Prisma, Role } from '@prisma/client';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { AuditService } from '../audit/audit.service';
import type { KeycloakIdentity } from '../auth/strategies/keycloak-identity.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { StaffInvitationAcceptService } from './staff-invitation-accept.service';
import { hashInvitationToken } from './staff-invitations.service';

const DAY = 24 * 60 * 60 * 1000;
const TOKEN = 'raw-token';

const identity = (overrides: Partial<KeycloakIdentity> = {}): KeycloakIdentity => ({
  sub: 'kc-sam',
  email: 'sam.patel@vine.test',
  email_verified: true,
  given_name: 'Sam',
  family_name: 'Patel',
  ...overrides,
});

const invitation = (overrides = {}) => ({
  id: 'inv-1',
  distributorId: 'dist-1',
  email: 'sam.patel@vine.test',
  roles: [Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF],
  tokenHash: hashInvitationToken(TOKEN),
  status: InvitationStatus.PENDING,
  expiresAt: new Date(Date.now() + 3 * DAY),
  distributor: { id: 'dist-1', name: 'Vine & Co' },
  ...overrides,
});

const sam = { id: 'user-sam', email: 'sam.patel@vine.test', firstName: 'Sam', lastName: 'Patel' };

describe('StaffInvitationAcceptService', () => {
  let service: StaffInvitationAcceptService;
  let memberships: { data: any }[];
  let claimResult: { count: number };
  const prisma: any = {
    staffInvitation: { findUnique: jest.fn() },
    membership: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const users = { findOrCreateFromKeycloak: jest.fn() };
  const audit = { record: jest.fn().mockResolvedValue({}) };
  const adminNotifications = { notifyOrganisationAdmins: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    memberships = [];
    claimResult = { count: 1 };
    prisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) =>
      fn({
        staffInvitation: { updateMany: jest.fn(async () => claimResult) },
        membership: { create: jest.fn(async (args) => { memberships.push(args); return { id: 'm-1' }; }) },
      }),
    );
    prisma.staffInvitation.findUnique.mockResolvedValue(invitation());
    prisma.membership.findFirst.mockResolvedValue(null);
    users.findOrCreateFromKeycloak.mockResolvedValue(sam);
    adminNotifications.notifyOrganisationAdmins.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        StaffInvitationAcceptService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: users },
        { provide: AuditService, useValue: audit },
        { provide: AdminNotificationsService, useValue: adminNotifications },
      ],
    }).compile();
    service = module.get(StaffInvitationAcceptService);
  });

  it('joins the inviting distributor with every invited role, and says where and as what', async () => {
    const result = await service.accept(identity(), TOKEN);

    expect(result).toEqual({ distributorId: 'dist-1', distributorName: 'Vine & Co', roles: [Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF] });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].data).toMatchObject({
      userId: 'user-sam',
      organisationId: 'dist-1',
      role: Role.OPERATIONS_MANAGER, // legacy scalar carries the first role
      roles: { create: [{ role: Role.OPERATIONS_MANAGER }, { role: Role.WAREHOUSE_STAFF }] },
    });
  });

  it('tells the Owners, after the fact, that someone joined', async () => {
    await service.accept(identity(), TOKEN);

    expect(adminNotifications.notifyOrganisationAdmins).toHaveBeenCalledWith(
      'dist-1',
      expect.objectContaining({
        type: 'STAFF_INVITE_ACCEPTED',
        title: 'Sam Patel joined your team',
        body: 'Accepted your invitation and can now sign in as Operations manager and Warehouse staff.',
        linkPath: '/team',
      }),
    );
  });

  it('still succeeds if the Owner notification cannot be written', async () => {
    adminNotifications.notifyOrganisationAdmins.mockRejectedValue(new Error('db blip'));
    await expect(service.accept(identity(), TOKEN)).resolves.toMatchObject({ distributorId: 'dist-1' });
    expect(memberships).toHaveLength(1);
  });

  it('matches the invited address ignoring case and surrounding whitespace', async () => {
    await expect(service.accept(identity({ email: ' Sam.Patel@VINE.test ' }), TOKEN)).resolves.toBeDefined();
  });

  it('refuses an identity with a different email, and creates no user for it', async () => {
    await expect(service.accept(identity({ email: 'someone.else@gmail.com' }), TOKEN)).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.findOrCreateFromKeycloak).not.toHaveBeenCalled();
    expect(memberships).toHaveLength(0);
  });

  it('404s for an unknown token', async () => {
    prisma.staffInvitation.findUnique.mockResolvedValue(null);
    await expect(service.accept(identity(), 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409s for an invitation already accepted', async () => {
    prisma.staffInvitation.findUnique.mockResolvedValue(invitation({ status: InvitationStatus.ACCEPTED }));
    await expect(service.accept(identity(), TOKEN)).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    ['revoked', { status: InvitationStatus.REVOKED }],
    ['expired by date', { expiresAt: new Date(Date.now() - 1000) }],
  ])('410s for an invitation that is %s', async (_label, overrides) => {
    prisma.staffInvitation.findUnique.mockResolvedValue(invitation(overrides));
    await expect(service.accept(identity(), TOKEN)).rejects.toBeInstanceOf(GoneException);
    expect(memberships).toHaveLength(0);
  });

  it('refuses an account that already belongs to a company', async () => {
    prisma.membership.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(service.accept(identity(), TOKEN)).rejects.toBeInstanceOf(ConflictException);
    expect(memberships).toHaveLength(0);
  });

  it('turns a duplicate-email account collision into a clear conflict', async () => {
    users.findOrCreateFromKeycloak.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(service.accept(identity(), TOKEN)).rejects.toThrow('An account with this email already exists');
  });

  it('loses gracefully to a simultaneous accept of the same link: conflict, and no second membership', async () => {
    claimResult = { count: 0 }; // another request flipped PENDING -> ACCEPTED first
    await expect(service.accept(identity(), TOKEN)).rejects.toBeInstanceOf(ConflictException);
    expect(memberships).toHaveLength(0);
    expect(adminNotifications.notifyOrganisationAdmins).not.toHaveBeenCalled();
  });
});
