import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { OrganisationType, Prisma, Role } from '@prisma/client';
import { DistributorsService } from './distributors.service';
import { PrismaService } from '../prisma/prisma.service';
import type { KeycloakIdentity } from '../auth/strategies/keycloak-identity.strategy';

const identity: KeycloakIdentity = {
  sub: 'kc-sub-1',
  email: 'owner@acme.com',
  email_verified: true,
  given_name: 'Ada',
  family_name: 'Acme',
};

const dto = {
  name: 'Acme Wines',
  addressLine1: '1 Barrel Way',
  addressCity: 'Leeds',
  addressPostcode: 'LS1 1AA',
  addressCountry: 'United Kingdom',
};

const createdOrg = {
  id: 'org-1',
  name: 'Acme Wines',
  slug: 'acme-wines',
  type: OrganisationType.DISTRIBUTOR,
  addressLine1: '1 Barrel Way',
  addressLine2: null,
  addressCity: 'Leeds',
  addressState: null,
  addressPostcode: 'LS1 1AA',
  addressCountry: 'United Kingdom',
  createdAt: new Date('2026-07-14T00:00:00Z'),
};

function buildTx() {
  return {
    user: { findFirst: jest.fn(), create: jest.fn() },
    membership: { findFirst: jest.fn(), create: jest.fn() },
    organisation: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
    $queryRaw: jest.fn(),
  };
}

describe('DistributorsService', () => {
  let service: DistributorsService;
  let tx: ReturnType<typeof buildTx>;

  beforeEach(async () => {
    tx = buildTx();
    const prisma = { $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)) };
    const module = await Test.createTestingModule({
      providers: [DistributorsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(DistributorsService);
  });

  it('creates user, organisation and DISTRIBUTOR_ADMIN membership for a fresh identity', async () => {
    tx.user.findFirst.mockResolvedValue(null);
    tx.user.create.mockResolvedValue({ id: 'user-1' });
    tx.membership.findFirst.mockResolvedValue(null);
    tx.organisation.findMany.mockResolvedValue([]);
    tx.organisation.create.mockResolvedValue(createdOrg);
    tx.membership.create.mockResolvedValue({});

    const result = await service.createForIdentity(identity, dto);

    expect(result).toEqual(createdOrg);
    expect(tx.user.create).toHaveBeenCalledWith({
      data: { keycloakId: 'kc-sub-1', email: 'owner@acme.com', firstName: 'Ada', lastName: 'Acme' },
    });
    expect(tx.organisation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Acme Wines', slug: 'acme-wines', type: OrganisationType.DISTRIBUTOR }),
      }),
    );
    expect(tx.membership.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', organisationId: 'org-1', role: Role.DISTRIBUTOR_ADMIN },
    });
  });

  it('reuses an existing user found by keycloakId without creating another', async () => {
    tx.user.findFirst.mockResolvedValue({ id: 'user-9' });
    tx.membership.findFirst.mockResolvedValue(null);
    tx.organisation.findMany.mockResolvedValue([]);
    tx.organisation.create.mockResolvedValue(createdOrg);
    tx.membership.create.mockResolvedValue({});

    await service.createForIdentity(identity, dto);

    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-9' }) }),
    );
  });

  it('returns the existing organisation when the user already administers a distributor', async () => {
    tx.user.findFirst.mockResolvedValue({ id: 'user-9' });
    tx.membership.findFirst.mockResolvedValue({ organisation: createdOrg });

    const result = await service.createForIdentity(identity, dto);

    expect(result).toEqual(createdOrg);
    expect(tx.organisation.create).not.toHaveBeenCalled();
    expect(tx.membership.create).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the email belongs to another account', async () => {
    tx.user.findFirst.mockResolvedValue(null);
    tx.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['email'] },
      }),
    );

    await expect(service.createForIdentity(identity, dto)).rejects.toThrow(ConflictException);
  });

  it('appends a numeric suffix when the slug is taken', async () => {
    tx.user.findFirst.mockResolvedValue({ id: 'user-9' });
    tx.membership.findFirst.mockResolvedValue(null);
    tx.organisation.findMany.mockResolvedValue([{ slug: 'acme-wines' }, { slug: 'acme-wines-2' }]);
    tx.organisation.create.mockResolvedValue({ ...createdOrg, slug: 'acme-wines-3' });
    tx.membership.create.mockResolvedValue({});

    await service.createForIdentity(identity, dto);

    expect(tx.organisation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'acme-wines-3' }) }),
    );
  });

  it('uses a caller-chosen slug verbatim and stores phone and email', async () => {
    tx.user.findFirst.mockResolvedValue({ id: 'user-9' });
    tx.membership.findFirst.mockResolvedValue(null);
    tx.organisation.findUnique.mockResolvedValue(null);
    tx.organisation.create.mockResolvedValue({ ...createdOrg, slug: 'my-cellar' });
    tx.membership.create.mockResolvedValue({});

    await service.createForIdentity(identity, {
      ...dto,
      slug: 'my-cellar',
      phone: '0113 496 0000',
      email: 'shop@acme.com',
    });

    expect(tx.organisation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'my-cellar', phone: '0113 496 0000', email: 'shop@acme.com' }),
      }),
    );
    // No derive/suffix path when the slug is chosen explicitly
    expect(tx.organisation.findMany).not.toHaveBeenCalled();
  });

  it('rejects a caller-chosen slug that is already taken with ConflictException', async () => {
    tx.user.findFirst.mockResolvedValue({ id: 'user-9' });
    tx.membership.findFirst.mockResolvedValue(null);
    tx.organisation.findUnique.mockResolvedValue({ id: 'other-org' });

    await expect(service.createForIdentity(identity, { ...dto, slug: 'taken-slug' })).rejects.toThrow(
      ConflictException,
    );
    expect(tx.organisation.create).not.toHaveBeenCalled();
  });

  it('retries once when organisation creation loses a slug race', async () => {
    tx.user.findFirst.mockResolvedValue({ id: 'user-9' });
    tx.membership.findFirst.mockResolvedValue(null);
    tx.organisation.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ slug: 'acme-wines' }]);
    tx.organisation.create
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['slug'] },
        }),
      )
      .mockResolvedValueOnce({ ...createdOrg, slug: 'acme-wines-2' });
    tx.membership.create.mockResolvedValue({});

    const result = await service.createForIdentity(identity, dto);

    expect(result.slug).toBe('acme-wines-2');
    expect(tx.organisation.create).toHaveBeenCalledTimes(2);
  });
});
