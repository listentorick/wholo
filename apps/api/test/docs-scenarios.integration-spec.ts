/**
 * Integration tests for the help-site scenario seeds (scripts/docs-scenarios).
 *
 * Real database: proves every scenario seed builds on the base, that teardown takes the
 * database back to exactly the base, and that a full clear leaves no docs rows in any
 * table. A new table that the clear-down misses fails here (a foreign key blocks the
 * delete, or its rows are left behind).
 *
 * Prerequisites:
 *   kubectl port-forward svc/wholo-postgresql 5432:5432
 *   DATABASE_URL=postgresql://wholo:wholo@localhost:5432/wholo (from .env.example)
 *
 * Wipes any docs data already in the database (it is reproducible with pnpm docs:seed). A live
 * docs Xero connection is saved to the real xero-connection.json first, so running this never
 * loses it; the Xero tests themselves use a temporary file and a fake token. Scenarios that need
 * Xero (withXero) aren't seeded here: they need the real Xero.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  AccountingConnectionStatus,
  AccountingProvider,
  IngestionRunStatus,
  OrganisationType,
  PrismaClient,
  Role,
  TaxClassification,
  TradeRelationshipStatus,
} from '@prisma/client';
import { clearAll, resetToBase, seedScenario } from '../scripts/docs-scenarios/lib/commands';
import { remainingDocsRows } from '../scripts/docs-scenarios/lib/clear';
import { DOCS_DISTRIBUTOR_ID, DOCS_DISTRIBUTOR_SLUG, DOCS_ONBOARDING_SLUGS, DOCS_USERS } from '../scripts/docs-scenarios/lib/ids';
import { SCENARIOS } from '../scripts/docs-scenarios/scenarios';
import { PRODUCTS } from '../scripts/docs-scenarios/scenarios/fixtures';
import { addProducts } from '../scripts/docs-scenarios/lib/builders';
import { addBranding, setImageStore } from '../scripts/docs-scenarios/lib/images';
import { setSignUpCleaner } from '../scripts/docs-scenarios/lib/sign-ups';
import {
  connectXero,
  DOCS_XERO_CONNECTION_ID,
  readSavedXeroConnection,
  saveXeroConnection,
  SavedXeroConnection,
} from '../scripts/docs-scenarios/lib/xero-connection';

const OTHER_DIST = 'test-integration-docs-other-dist';
const SHARED_CUSTOMER = 'test-integration-docs-shared-customer';
const IMPOSTER = 'test-integration-docs-imposter';
const ONBOARDED = 'test-integration-docs-onboarded';

describe('Docs scenario seeds (integration)', () => {
  const prisma = new PrismaClient();

  const cleanOutsiders = async () => {
    await prisma.tradeRelationship.deleteMany({ where: { customerId: SHARED_CUSTOMER } });
    await prisma.membership.deleteMany({ where: { organisationId: { in: [OTHER_DIST, IMPOSTER] } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [OTHER_DIST, SHARED_CUSTOMER, IMPOSTER] } } });
  };

  const countBase = async () => ({
    organisations: await prisma.organisation.count({ where: { id: DOCS_DISTRIBUTOR_ID } }),
    customers: await prisma.tradeRelationship.count({ where: { distributorId: DOCS_DISTRIBUTOR_ID } }),
    products: await prisma.product.count({ where: { distributorId: DOCS_DISTRIBUTOR_ID } }),
    orders: await prisma.order.count({ where: { distributorId: DOCS_DISTRIBUTOR_ID } }),
    productTypes: await prisma.productType.count({ where: { distributorId: DOCS_DISTRIBUTOR_ID } }),
    suppliers: await prisma.supplier.count({ where: { distributorId: DOCS_DISTRIBUTOR_ID } }),
    memberships: await prisma.membership.count({ where: { organisationId: DOCS_DISTRIBUTOR_ID } }),
  });

  let xeroDir: string;
  // Seed images go to this in-memory store instead of the cluster's R2 bucket.
  const storedImages = new Map<string, Buffer>();

  beforeAll(async () => {
    setImageStore({
      exists: async (key) => storedImages.has(key),
      upload: async (key, body) => void storedImages.set(key, body),
    });
    // No Keycloak or MailHog here: sign-ups are made by hand in a real run only.
    setSignUpCleaner(async () => {});
    // Keep a real connection safe (it goes to the real file), then point the Xero saves at a
    // temporary file for the rest of the run.
    await saveXeroConnection(prisma);
    xeroDir = mkdtempSync(join(tmpdir(), 'docs-xero-'));
    process.env.DOCS_XERO_CONNECTION_FILE = join(xeroDir, 'xero-connection.json');
    await cleanOutsiders();
    await clearAll(prisma);
  });

  afterEach(cleanOutsiders);

  afterAll(async () => {
    await clearAll(prisma);
    await prisma.$disconnect();
    delete process.env.DOCS_XERO_CONNECTION_FILE;
    rmSync(xeroDir, { recursive: true, force: true });
    setImageStore(null);
    setSignUpCleaner(null);
  });

  it('uploads seed images once, and teardown keeps the files', async () => {
    const uploadBranded = async () => {
      await resetToBase(prisma);
      await addProducts(prisma, [PRODUCTS.rioja, PRODUCTS.goldenAle]);
      return addBranding(prisma);
    };
    // Logo (2 variants) + banner (2) + the Rioja photo (3); the ale has no photo.
    expect(await uploadBranded()).toBe(7);
    expect(await uploadBranded()).toBe(0);
    expect(await prisma.assetImage.count({ where: { distributorId: DOCS_DISTRIBUTOR_ID } })).toBe(3);

    await resetToBase(prisma);
    expect(await prisma.assetImage.count({ where: { distributorId: DOCS_DISTRIBUTOR_ID } })).toBe(0);
    expect(storedImages.size).toBe(7);
  });

  it('creates the base, and creating it again gives the same base', async () => {
    await resetToBase(prisma);
    const first = await countBase();
    await resetToBase(prisma);
    expect(await countBase()).toEqual(first);
    expect(first).toEqual(
      expect.objectContaining({ organisations: 1, customers: 0, products: 0, orders: 0, memberships: 1 }),
    );
  });

  // Some scenarios need nothing beyond the base, so a seed isn't required to add rows;
  // what matters is that teardown puts every docs table back exactly as the base left it.
  // Xero scenarios need the real Xero and the saved connection, so they're run by hand.
  const WITHOUT_XERO = Object.entries(SCENARIOS)
    .filter(([, entry]) => typeof entry === 'function' || entry.startsFrom !== 'xero')
    .map(([scenario]) => scenario);

  it.each(WITHOUT_XERO)('seeds %s on the base, and teardown returns to the base', async (scenario) => {
    await resetToBase(prisma);
    const base = await remainingDocsRows(prisma);

    await seedScenario(prisma, scenario);
    await resetToBase(prisma);

    expect(await remainingDocsRows(prisma)).toEqual(base);
  });

  it('runs every seed one after another without leftovers between them', async () => {
    for (const scenario of WITHOUT_XERO) {
      await seedScenario(prisma, scenario);
    }
    await clearAll(prisma);
    expect(await remainingDocsRows(prisma)).toEqual({});
  });

  it('clears everything, base included, and leaves no docs rows in any table', async () => {
    await seedScenario(prisma, 'accept-order');
    await clearAll(prisma);

    expect(await remainingDocsRows(prisma)).toEqual({});
    expect(await prisma.organisation.count({ where: { id: DOCS_DISTRIBUTOR_ID } })).toBe(0);
    expect(
      await prisma.user.count({ where: { keycloakId: { in: Object.values(DOCS_USERS).map((u) => u.keycloakId) } } }),
    ).toBe(0);
  });

  it('keeps a customer that also trades with another distributor', async () => {
    await resetToBase(prisma);
    await prisma.organisation.create({ data: { id: OTHER_DIST, name: 'Other Distributor', type: OrganisationType.DISTRIBUTOR, slug: OTHER_DIST } });
    await prisma.organisation.create({ data: { id: SHARED_CUSTOMER, name: 'Shared Customer', type: OrganisationType.TRADE_CUSTOMER } });
    for (const distributorId of [DOCS_DISTRIBUTOR_ID, OTHER_DIST]) {
      await prisma.tradeRelationship.create({
        data: { distributorId, customerId: SHARED_CUSTOMER, status: TradeRelationshipStatus.ACTIVE },
      });
    }

    await clearAll(prisma);

    expect(await prisma.organisation.count({ where: { id: SHARED_CUSTOMER } })).toBe(1);
    expect(await prisma.tradeRelationship.count({ where: { customerId: SHARED_CUSTOMER } })).toBe(1);
  });

  it('starts a from-nothing scenario with no base and no docs sign-in users', async () => {
    await seedScenario(prisma, 'distributor-onboarding');

    expect(await remainingDocsRows(prisma)).toEqual({});
    expect(await prisma.organisation.count({ where: { id: DOCS_DISTRIBUTOR_ID } })).toBe(0);
    expect(
      await prisma.user.count({ where: { keycloakId: { in: Object.values(DOCS_USERS).map((u) => u.keycloakId) } } }),
    ).toBe(0);
  });

  it('clears a business the owner created through onboarding, and creates the base again', async () => {
    await seedScenario(prisma, 'get-started-owner');
    // What the onboarding wizard does: a user with a generated id, a business, a membership.
    const owner = await prisma.user.create({
      data: { keycloakId: DOCS_USERS.owner.keycloakId, email: DOCS_USERS.owner.email, firstName: 'James', lastName: 'Vine' },
    });
    await prisma.organisation.create({
      data: { id: ONBOARDED, name: 'Harbour Wines', type: OrganisationType.DISTRIBUTOR, slug: DOCS_ONBOARDING_SLUGS[0] },
    });
    await prisma.membership.create({ data: { userId: owner.id, organisationId: ONBOARDED, role: Role.DISTRIBUTOR_ADMIN } });
    await prisma.taxType.create({
      data: { distributorId: ONBOARDED, name: 'Standard VAT', classification: TaxClassification.STANDARD, ratePercentage: 20 },
    });

    await resetToBase(prisma);

    expect(await prisma.organisation.count({ where: { id: ONBOARDED } })).toBe(0);
    expect(await prisma.taxType.count({ where: { distributorId: ONBOARDED } })).toBe(0);
    expect(await prisma.user.count({ where: { id: owner.id } })).toBe(0);
    expect(await countBase()).toEqual(expect.objectContaining({ organisations: 1, memberships: 1 }));
  });

  it('refuses when another organisation already uses the docs slug', async () => {
    await clearAll(prisma);
    await prisma.organisation.create({
      data: { id: IMPOSTER, name: 'Demo Vine & Co', type: OrganisationType.DISTRIBUTOR, slug: DOCS_DISTRIBUTOR_SLUG },
    });

    await expect(resetToBase(prisma)).rejects.toThrow(/already uses the slug/);
    await expect(clearAll(prisma)).rejects.toThrow(/already uses the slug/);
    expect(await prisma.organisation.count({ where: { id: IMPOSTER } })).toBe(1);
  });

  it('refuses when a docs sign-in user belongs to another distributor', async () => {
    await resetToBase(prisma);
    const owner = await prisma.user.findUniqueOrThrow({ where: { keycloakId: DOCS_USERS.owner.keycloakId } });
    await prisma.organisation.create({ data: { id: IMPOSTER, name: 'Demo Distributor', type: OrganisationType.DISTRIBUTOR, slug: IMPOSTER } });
    await prisma.membership.create({ data: { userId: owner.id, organisationId: IMPOSTER, role: Role.DISTRIBUTOR_ADMIN } });

    await expect(resetToBase(prisma)).rejects.toThrow(/also a member of distributor/);
    expect(await prisma.organisation.count({ where: { id: DOCS_DISTRIBUTOR_ID } })).toBe(1);
  });

  it('refuses a database that is not on this machine', async () => {
    const saved = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://wholo:wholo@db.example.com:5432/wholo';
    try {
      await expect(resetToBase(prisma)).rejects.toThrow(/local database only/);
    } finally {
      process.env.DATABASE_URL = saved;
    }
  });
  describe('the saved Xero connection', () => {
    const FAKE_BLOB = 'iv:tag:fake-encrypted-token-set';

    const addLiveConnection = async (blob: string) => {
      await prisma.accountingOrganisation.create({
        data: { id: 'test-docs-xero-org', distributorId: DOCS_DISTRIBUTOR_ID, provider: AccountingProvider.XERO, externalOrganisationId: 'tenant-1', name: 'Demo Company (UK)' },
      });
      await prisma.accountingConnection.create({
        data: {
          distributorId: DOCS_DISTRIBUTOR_ID,
          accountingOrganisationId: 'test-docs-xero-org',
          provider: AccountingProvider.XERO,
          status: AccountingConnectionStatus.CONNECTED,
          scopes: 'accounting.contacts',
          encryptedCredentialData: blob,
          connectedByUserId: DOCS_USERS.owner.id,
          connectedAt: new Date(),
        },
      });
    };

    beforeEach(() => rmSync(process.env.DOCS_XERO_CONNECTION_FILE!, { force: true }));

    it('saves a live connection before a reset clears it', async () => {
      await resetToBase(prisma);
      await addLiveConnection(FAKE_BLOB);

      await resetToBase(prisma);

      expect(readSavedXeroConnection()).toMatchObject({
        externalOrganisationId: 'tenant-1',
        organisationName: 'Demo Company (UK)',
        encryptedCredentialData: FAKE_BLOB,
      });
      expect(await prisma.accountingConnection.count({ where: { distributorId: DOCS_DISTRIBUTOR_ID } })).toBe(0);
    });

    it('saves the newest token at the final clear', async () => {
      await resetToBase(prisma);
      await addLiveConnection('iv:tag:newer-token');

      await clearAll(prisma);

      expect(readSavedXeroConnection()?.encryptedCredentialData).toBe('iv:tag:newer-token');
      expect(await remainingDocsRows(prisma)).toEqual({});
    });

    it('leaves the saved file alone when nothing is connected', async () => {
      const saved: SavedXeroConnection = {
        provider: AccountingProvider.XERO,
        externalOrganisationId: 'tenant-1',
        organisationName: 'Demo Company (UK)',
        invoiceExportTargetStatus: 'DRAFT',
        scopes: 'accounting.contacts',
        encryptedCredentialData: FAKE_BLOB,
        savedAt: '2026-11-01T00:00:00.000Z',
      };
      writeFileSync(process.env.DOCS_XERO_CONNECTION_FILE!, JSON.stringify(saved));

      await resetToBase(prisma);

      expect(JSON.parse(readFileSync(process.env.DOCS_XERO_CONNECTION_FILE!, 'utf8'))).toEqual(saved);
    });

    it('restores the connection, never synced and with the scheduler held off', async () => {
      await resetToBase(prisma);
      await addLiveConnection(FAKE_BLOB);
      await resetToBase(prisma);

      await connectXero(prisma, { synced: false });

      const connection = await prisma.accountingConnection.findUniqueOrThrow({ where: { id: DOCS_XERO_CONNECTION_ID } });
      expect(connection).toMatchObject({ status: AccountingConnectionStatus.CONNECTED, encryptedCredentialData: FAKE_BLOB });
      const runs = await prisma.ingestionRun.findMany({ where: { sourceRef: DOCS_XERO_CONNECTION_ID } });
      expect(runs).toHaveLength(5);
      for (const run of runs) {
        expect(run.status).toBe(IngestionRunStatus.FAILED);
        expect(run.lastSucceededAt).toBeNull();
        expect(run.nextRunAt!.getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
      }

      await resetToBase(prisma);
      expect(await prisma.ingestionRun.count({ where: { distributorId: DOCS_DISTRIBUTOR_ID } })).toBe(0);
    });

    it('refuses to connect when there is no saved connection', async () => {
      await resetToBase(prisma);
      await expect(connectXero(prisma, { synced: false })).rejects.toThrow('No saved Xero connection');
    });
  });
});
