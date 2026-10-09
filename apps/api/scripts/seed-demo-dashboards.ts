/**
 * Rebuilds Vine & Co's order data so the local dashboards (Delivery |
 * Customers | Sales) tell a story: 60 customers buying for six months, three
 * of them at risk, and today's deliveries part-way through — 3 runs, 30 drops.
 * The story itself is src/demo-data/demo-story.plan.ts; this writes it.
 *
 * LOCAL ONLY, and destructive: it deletes every order, delivery run, delivery
 * outcome and analytics fact the distributor has, then writes the story in
 * their place. Customers, products, routes, users and accounting connections
 * are left alone.
 *
 * Every delivered order carries the evidence a driver would have captured:
 * who signed for it and their signature (or where it was left), a proof photo
 * and the device's location (src/demo-data/demo-delivery-evidence.plan.ts).
 * The photos are the handful in scripts/demo-proof-photos (see CREDITS.md
 * there), uploaded once to the private delivery bucket and shared by every
 * order — so this needs the R2_* variables as well as the database.
 *
 * Rows are written straight to the tables, facts included, and no outbox
 * events are emitted — on purpose. Real OrderAccepted events would email
 * customers and export thousands of invoices to a connected accounting system.
 *
 * Everything is relative to today, so run it again on the day of a demo:
 * by tomorrow, today's undelivered drops are simply overdue.
 *
 * Usage: pnpm --filter @wholo/api db:demo:dashboards
 *        pnpm --filter @wholo/api db:demo:dashboards --audit-only   (rewrite the orders' audit trail, change nothing else)
 * Requires DATABASE_URL (port-forward Postgres first: pnpm k8s:pf:postgres) and the R2_* variables; both are
 * read from apps/api/.env when they are not already in the environment.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { OrderLineStatus, OrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { distributorLocalDate } from '../src/common/distributor-local-date';
import { CustomerHealthService } from '../src/customer-health/customer-health.service';
import { CustomerPaymentsService } from '../src/customer-payments/customer-payments.service';
import { DeliveryOverviewService } from '../src/delivery-overview/delivery-overview.service';
import { ImageProcessingService } from '../src/asset-images/image-processing.service';
import { R2StorageService } from '../src/asset-images/r2-storage.service';
import { DELIVERY_PHOTO_CONFIG } from '../src/delivery-links/delivery-photo.service';
import { DemoEvidence, PROOF_PHOTOS, deliveryEvidence } from '../src/demo-data/demo-delivery-evidence.plan';
import { DEMO_CUSTOMER_COUNT, DemoOrder, TODAY_RUNS, TODAY_TO_ACCEPT, buildDemoStory } from '../src/demo-data/demo-story.plan';

const DISTRIBUTOR_ID = 'seed-distributor-1';
const DEMO_CUSTOMER_PREFIX = 'demo-cust-';
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 1000;

// Trade customers added to bring the roster up to sixty. Names only; each gets a made-up address in one of the towns.
const VENUES = [
  'The Mill House Hotel', 'Harbour Lights Brasserie', 'The Copper Kettle', 'Fox & Finch', 'The Old Bank Tavern', 'Saffron Table',
  'The Wheatsheaf', 'Juniper & Rye', 'The Station Hotel', 'Olive Grove Deli', 'The Cross Keys', 'Ember Grill',
  'The White Hart', 'Larder & Vine', 'The Kingfisher Inn', 'Northgate Social', 'The Painted Lady', 'Marlowe\'s Kitchen',
  'The Black Swan', 'Thyme & Tide', 'The Drovers Arms', 'Cellar Door Wine Bar', 'The Red Lion', 'Tanners Yard',
  'The Buttery', 'Lockside Bar & Grill', 'The Crown & Anchor', 'Hazel & Oak', 'The Golden Fleece', 'Petit Four Bistro',
  'The Fleece Inn', 'Sorrel Restaurant', 'The Shepherds Rest', 'Wharf Street Kitchen', 'The Queens Head', 'Bramble & Co',
  'The George Hotel', 'Quarry Bank Golf Club', 'The Plough', 'Mezzaluna', 'The Three Tuns', 'Abbey Fields Hotel',
  'The Woolpack', 'Linden Tree Cafe Bar', 'The Bay Horse', 'Field & Fork', 'The Royal Oak', 'Pavilion Brasserie',
  'The Star Inn', 'Castlegate Wine Rooms', 'The Hare & Hounds', 'Orchard House Hotel', 'The Malt Shovel', 'Riverbank Rooms',
  'The Swan Hotel', 'Greengate Supper Club', 'The Bull', 'Foundry Bar', 'The Angel Inn', 'Topsham Road Bistro',
];
const TOWNS = [
  { city: 'Leeds', postcode: 'LS1' }, { city: 'York', postcode: 'YO1' }, { city: 'Harrogate', postcode: 'HG1' }, { city: 'Skipton', postcode: 'BD23' },
  { city: 'Ilkley', postcode: 'LS29' }, { city: 'Wetherby', postcode: 'LS22' }, { city: 'Ripon', postcode: 'HG4' }, { city: 'Malton', postcode: 'YO17' },
];
const STREETS = ['High Street', 'Market Place', 'Station Road', 'Church Lane', 'Bridge Street', 'Mill Lane'];

interface Address {
  line1: string;
  city: string;
  postcode: string;
  country: string;
}

function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Refusing to run against "${host}": this script deletes a distributor's orders and is for a local database only`);
  }
}

async function inBatches<T>(rows: T[], write: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) await write(rows.slice(i, i + BATCH));
}

const pounds = (pence: number): Prisma.Decimal => new Prisma.Decimal(pence).div(100);

/** Adds trade customers (the way prisma/seed.ts adds its own) until the distributor has sixty active ones. */
async function topUpCustomers(prisma: PrismaService, today: Date, priceListId: string | null, deliveryProfileId: string | null): Promise<void> {
  const active = await prisma.tradeRelationship.findMany({ where: { distributorId: DISTRIBUTOR_ID, status: 'ACTIVE', deletedAt: null }, select: { customerId: true } });
  const others = active.filter((r) => !r.customerId.startsWith(DEMO_CUSTOMER_PREFIX)).length;
  const needed = DEMO_CUSTOMER_COUNT - others;
  if (needed < 0) throw new Error(`The distributor already has ${others} active customers of its own; the story needs at most ${DEMO_CUSTOMER_COUNT}`);

  // Dated before any relationship fact exists, so the roster's "active since" falls back to this and the
  // relationship reconciliation does not expect facts for them.
  const since = new Date(today.getTime() - 210 * DAY_MS);
  for (let n = 0; n < needed; n++) {
    const id = `${DEMO_CUSTOMER_PREFIX}${String(n + 1).padStart(2, '0')}`;
    const name = VENUES[n];
    const town = TOWNS[n % TOWNS.length];
    const address: Address = { line1: `${3 + ((n * 7) % 90)} ${STREETS[n % STREETS.length]}`, city: town.city, postcode: `${town.postcode} ${1 + (n % 9)}AB`, country: 'United Kingdom' };
    const email = `orders@${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.example`;
    const orgFields = { name, email, addressLine1: address.line1, addressCity: address.city, addressPostcode: address.postcode, addressCountry: address.country };

    await prisma.organisation.upsert({ where: { id }, update: orgFields, create: { id, type: 'TRADE_CUSTOMER', createdAt: since, ...orgFields } });
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { id: `demo-user-${id}`, email, firstName: 'Orders', lastName: name, createdAt: since },
    });
    const membership = await prisma.membership.upsert({
      where: { userId_organisationId: { userId: user.id, organisationId: id } },
      update: { role: Role.TRADE_CUSTOMER },
      create: { userId: user.id, organisationId: id, role: Role.TRADE_CUSTOMER },
    });
    await prisma.membershipRole.upsert({
      where: { membershipId_role: { membershipId: membership.id, role: Role.TRADE_CUSTOMER } },
      update: {},
      create: { membershipId: membership.id, role: Role.TRADE_CUSTOMER },
    });

    const accountNumber = `VC-${2001 + n}`;
    const relationship = await prisma.tradeRelationship.upsert({
      where: { distributorId_customerId: { distributorId: DISTRIBUTOR_ID, customerId: id } },
      update: { status: 'ACTIVE', deletedAt: null },
      create: {
        id: `demo-rel-${id}`, distributorId: DISTRIBUTOR_ID, customerId: id, status: 'ACTIVE', accountNumber, activeAccountNumber: accountNumber, createdAt: since,
        deliveryLine1: address.line1, deliveryCity: address.city, deliveryPostcode: address.postcode, deliveryCountry: address.country,
      },
    });
    await prisma.traderCustomerSettings.upsert({
      where: { tradeRelationshipId: relationship.id },
      update: {},
      create: { tradeRelationshipId: relationship.id, priceListId, deliveryProfileId },
    });
  }
}

/** Every roster customer ends up on one of the three routes, the unassigned ones filling whichever route is shortest. */
async function assignRoutes(prisma: PrismaService, routeIds: string[], customerIds: string[], adminUserId: string): Promise<Map<string, { routeIndex: number; dropPosition: number }>> {
  const existing = await prisma.deliveryRouteCustomer.findMany({
    where: { routeId: { in: routeIds }, removedAt: null },
    select: { routeId: true, customerId: true, defaultDropPosition: true },
  });
  const placed = new Map<string, { routeIndex: number; dropPosition: number }>();
  const sizes = routeIds.map(() => 0);
  const lastPosition = routeIds.map(() => 0);
  for (const row of existing) {
    const routeIndex = routeIds.indexOf(row.routeId);
    lastPosition[routeIndex] = Math.max(lastPosition[routeIndex], row.defaultDropPosition);
    if (!customerIds.includes(row.customerId)) continue;
    placed.set(row.customerId, { routeIndex, dropPosition: row.defaultDropPosition });
    sizes[routeIndex]++;
  }

  const additions: Prisma.DeliveryRouteCustomerCreateManyInput[] = [];
  for (const customerId of customerIds) {
    if (placed.has(customerId)) continue;
    const routeIndex = sizes.indexOf(Math.min(...sizes));
    const dropPosition = ++lastPosition[routeIndex];
    sizes[routeIndex]++;
    placed.set(customerId, { routeIndex, dropPosition });
    additions.push({ routeId: routeIds[routeIndex], customerId, defaultDropPosition: dropPosition, assignedByUserId: adminUserId });
  }
  if (additions.length) await prisma.deliveryRouteCustomer.createMany({ data: additions });
  return placed;
}

interface ProofPhotoObject {
  /** R2 keys by variant, the shape order_delivery_photos.variants holds. */
  variants: Record<string, string>;
  sizeBytes: number;
  width: number;
  height: number;
}

/**
 * Puts the proof photos in the private delivery bucket, through the same pipeline a driver's upload
 * goes through. One set of objects serves every order: they sit under `demo-proof` where an order id
 * would be, so the app's per-order photo deletion (which only touches its own order's prefix) can never
 * remove them. Uploading again just overwrites the same keys.
 */
async function uploadProofPhotos(): Promise<Map<string, ProofPhotoObject>> {
  const r2 = new R2StorageService(new ConfigService());
  const images = new ImageProcessingService();
  const uploaded = new Map<string, ProofPhotoObject>();
  for (const photo of PROOF_PHOTOS) {
    const source = readFileSync(join(__dirname, 'demo-proof-photos', `${photo.name}.jpg`));
    const processed = await images.process(source, 'image/jpeg', source.length, DELIVERY_PHOTO_CONFIG);
    const variants: Record<string, string> = {};
    for (const [variant, { buffer }] of processed.variants) {
      variants[variant] = `distributors/${DISTRIBUTOR_ID}/deliveries/demo-proof/${photo.name}/${variant}.webp`;
      await r2.upload(variants[variant], buffer, 'image/webp', r2.deliveryBucket);
    }
    uploaded.set(photo.name, { variants, sizeBytes: source.length, width: processed.sourceWidth, height: processed.sourceHeight });
  }
  return uploaded;
}

async function wipe(prisma: PrismaService): Promise<void> {
  const ofDistributor = { distributorId: DISTRIBUTOR_ID };
  await prisma.notificationDelivery.deleteMany({ where: { notification: { order: ofDistributor } } });
  await prisma.notification.deleteMany({ where: { order: ofDistributor } });
  await prisma.accountingInvoiceExport.deleteMany({ where: ofDistributor });
  await prisma.orderDeliveryPhoto.deleteMany({ where: { order: ofDistributor } });
  await prisma.orderDeliveryOutcome.deleteMany({ where: { order: ofDistributor } });
  await prisma.deliveryRunOrder.deleteMany({ where: { run: ofDistributor } });
  await prisma.deliveryRun.deleteMany({ where: ofDistributor });
  await prisma.orderLine.deleteMany({ where: ofDistributor });
  await prisma.order.deleteMany({ where: ofDistributor });
  await prisma.orderFact.deleteMany({ where: ofDistributor });
  await prisma.orderLineFact.deleteMany({ where: ofDistributor });
  await prisma.orderAnalyticsState.deleteMany({ where: ofDistributor });
  await prisma.deliveryFact.deleteMany({ where: ofDistributor });
  await prisma.invoiceFact.deleteMany({ where: ofDistributor });
  await prisma.invoiceAnalyticsState.deleteMany({ where: ofDistributor });
  // The audit trail of the orders and runs just deleted (audit rows carry no foreign key to what they describe).
  await prisma.auditLog.deleteMany({ where: { ...ofDistributor, entityType: { in: ['ORDER', 'DELIVERY_RUN'] } } });
}

const PROVIDER_NAMES: Record<string, string> = { XERO: 'Xero' };

/**
 * Gives every order the audit trail the app would have written as it moved through its life — submitted,
 * accepted (or rejected / cancelled), delivery outcome, invoice raised and paid, completed — with the same
 * actions, wording and payloads as the services that normally write them, dated when each thing happened.
 * Built from the orders as they stand in the database, so it can be re-run on its own (--audit-only).
 */
async function writeOrderAuditTrail(prisma: PrismaService): Promise<number> {
  const ofDistributor = { distributorId: DISTRIBUTOR_ID };
  const orders = await prisma.order.findMany({
    where: ofDistributor,
    select: {
      id: true, status: true, placedByUserId: true, submittedAt: true, createdAt: true, updatedAt: true,
      acceptedAt: true, acceptedByUserId: true, rejectedAt: true, rejectedByUserId: true, rejectionReason: true,
      cancelledAt: true, cancelledByUserId: true, cancellationReason: true,
      deliveryOutcome: { select: { outcome: true, dropMethod: true, recordedAt: true, latitude: true, locationUnavailable: true, submittedViaQrToken: true, _count: { select: { photos: true } } } },
      invoiceExports: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  const userIds = [...new Set(orders.flatMap((o) => [o.placedByUserId, o.acceptedByUserId, o.rejectedByUserId, o.cancelledByUserId]).filter((id): id is string => !!id))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } });
  const nameOf = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  const rows: Prisma.AuditLogCreateManyInput[] = [];
  for (const o of orders) {
    const add = (action: string, createdAt: Date, summary: string, userId: string | null, changes?: Prisma.InputJsonValue): void => {
      rows.push({
        ...ofDistributor, entityType: 'ORDER', entityId: o.id, action, summary, changes, createdAt,
        actorType: userId ? 'USER' : 'SYSTEM', actorUserId: userId, actorName: userId ? nameOf.get(userId) : undefined,
      });
    };
    add('ORDER_SUBMITTED', o.submittedAt ?? o.createdAt, 'Submitted the order', o.placedByUserId);
    if (o.acceptedAt) add('ORDER_ACCEPTED', o.acceptedAt, 'Accepted the order', o.acceptedByUserId);
    if (o.rejectedAt) add('ORDER_REJECTED', o.rejectedAt, 'Rejected the order', o.rejectedByUserId, { reason: o.rejectionReason });
    if (o.cancelledAt) add('ORDER_CANCELLED', o.cancelledAt, 'Cancelled the order', o.cancelledByUserId, { reason: o.cancellationReason });

    const outcome = o.deliveryOutcome;
    if (outcome) {
      add('DELIVERY_OUTCOME_RECORDED', outcome.recordedAt, `Delivery outcome recorded via QR link: ${outcome.outcome}`, null, {
        outcome: outcome.outcome, dropMethod: outcome.dropMethod, photoCount: outcome._count.photos,
        locationCaptured: !outcome.locationUnavailable && outcome.latitude != null, submittedViaQrToken: outcome.submittedViaQrToken,
      });
    }

    const invoice = o.invoiceExports[0];
    let paidAt: Date | null = null;
    if (invoice?.status === 'COMPLETED' && invoice.externalInvoiceId) {
      const provider = PROVIDER_NAMES[invoice.provider] ?? invoice.provider;
      const label = invoice.externalInvoiceNumber ?? invoice.externalInvoiceId;
      // Raised just after the event that triggered it, so the timeline reads in order.
      const raisedAt = new Date((invoice.exportedAt ?? invoice.createdAt).getTime() + 1000);
      add('INVOICE_EXPORT_COMPLETED', raisedAt, `Invoice ${label} raised in ${provider}`, null, { exportId: invoice.id, externalInvoiceId: invoice.externalInvoiceId, adopted: false });
      if (invoice.invoiceState === 'PAID') {
        paidAt = invoice.providerUpdatedAt ?? invoice.stateSyncedAt ?? raisedAt;
        add('INVOICE_PAYMENT_STATUS_CHANGED', paidAt, `Invoice ${label} marked paid in ${provider}`, null, {
          exportId: invoice.id, fromStatus: 'NOT_SYNCED', toStatus: 'PAID', amountPaid: invoice.amountPaid?.toString() ?? '0', amountDue: invoice.amountDue?.toString() ?? '0', currency: 'GBP',
        });
      }
    }
    if (o.status === 'COMPLETED') {
      add('ORDER_COMPLETED', new Date((paidAt ?? o.updatedAt).getTime() + 1), 'Order completed — delivered and paid', null, { from: 'DELIVERED', to: 'COMPLETED', paymentStatus: 'PAID' });
    }
  }

  await prisma.auditLog.deleteMany({ where: { ...ofDistributor, entityType: 'ORDER' } });
  await inBatches(rows, (batch) => prisma.auditLog.createMany({ data: batch }));
  return rows.length;
}

const LINE_STATUS: Record<OrderStatus, OrderLineStatus> = {
  SUBMITTED: 'SUBMITTED', ACCEPTED: 'ACCEPTED', DELIVERED: 'ACCEPTED', DELIVERY_FAILED: 'ACCEPTED', COMPLETED: 'ACCEPTED', REJECTED: 'REJECTED', CANCELLED: 'CANCELLED',
};

async function main() {
  assertLocalDatabase();
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const distributor = await prisma.organisation.findUnique({ where: { id: DISTRIBUTOR_ID }, include: { distributorSettings: true } });
    if (!distributor) throw new Error(`Distributor ${DISTRIBUTOR_ID} not found — run the seed first (pnpm db:seed)`);
    const timezone = distributor.distributorSettings?.timezone ?? 'UTC';
    if (process.argv.includes('--audit-only')) {
      console.log(`Rewrote the audit trail of "${distributor.name}"'s orders: ${await writeOrderAuditTrail(prisma)} entries.`);
      return;
    }
    const now = new Date();
    const today = distributorLocalDate(now, timezone);
    const localDate = (instant: Date): Date => distributorLocalDate(instant, timezone);

    const admin = await prisma.membership.findFirst({ where: { organisationId: DISTRIBUTOR_ID }, orderBy: { createdAt: 'asc' }, select: { userId: true } });
    if (!admin) throw new Error('The distributor has no staff user to accept orders as');
    const routes = await prisma.deliveryRoute.findMany({ where: { distributorId: DISTRIBUTOR_ID, active: true }, orderBy: { createdAt: 'asc' }, take: TODAY_RUNS.length });
    if (routes.length < TODAY_RUNS.length) throw new Error(`The story needs ${TODAY_RUNS.length} active delivery routes; found ${routes.length}`);
    const priceList = await prisma.priceList.findFirst({ where: { distributorId: DISTRIBUTOR_ID, isDefault: true }, select: { id: true } });
    const deliveryProfile = await prisma.deliveryProfile.findFirst({ where: { distributorId: DISTRIBUTOR_ID, active: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    const products = await prisma.product.findMany({
      where: { distributorId: DISTRIBUTOR_ID, status: 'ACTIVE', price: { not: null } },
      orderBy: { sku: 'asc' },
      include: { taxType: true },
    });

    await topUpCustomers(prisma, today, priceList?.id ?? null, deliveryProfile?.id ?? null);

    const roster = await prisma.tradeRelationship.findMany({
      where: { distributorId: DISTRIBUTOR_ID, status: 'ACTIVE', deletedAt: null },
      orderBy: { customerId: 'asc' },
      include: { customer: { include: { memberships: { orderBy: { createdAt: 'asc' }, take: 1, select: { userId: true } } } } },
    });
    if (roster.length !== DEMO_CUSTOMER_COUNT) throw new Error(`Expected ${DEMO_CUSTOMER_COUNT} active customers after topping up, found ${roster.length}`);
    // The distributor's own customers first, then the added ones — a stable order, so the same customer plays the same part on every run.
    const isDemo = (customerId: string) => customerId.startsWith(DEMO_CUSTOMER_PREFIX);
    roster.sort((a, b) => Number(isDemo(a.customerId)) - Number(isDemo(b.customerId)) || a.customerId.localeCompare(b.customerId));
    const placement = await assignRoutes(prisma, routes.map((r) => r.id), roster.map((r) => r.customerId), admin.userId);

    const story = buildDemoStory({
      today,
      now,
      customers: roster.map((r) => ({ organisationId: r.customerId, ...placement.get(r.customerId)! })),
      products: products.map((p) => ({ id: p.id, pricePence: Math.round(Number(p.price) * 100) })),
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    // Before anything is deleted: if the bucket cannot be reached, the data that is there stays.
    const proofPhotos = await uploadProofPhotos();

    await wipe(prisma);

    // Real order numbers, drawn from the same sequence the app uses, in the order the orders were placed.
    const numbers = await prisma.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('order_number_seq') FROM generate_series(1, ${story.orders.length})`;
    const orderNumber = new Map(story.orders.map((o, n) => [o.id, `ORD-${o.submittedAt.getUTCFullYear()}-${String(numbers[n].nextval).padStart(5, '0')}`]));

    const lastEventAt = (o: DemoOrder): Date => o.outcome?.recordedAt ?? o.closedAt ?? o.acceptedAt ?? o.submittedAt;
    const taxPence = (o: DemoOrder): number =>
      o.lines.reduce((total, l) => total + Math.round((l.subtotalPence * Number(productById.get(l.productId)!.taxType?.ratePercentage ?? 0)) / 100), 0);

    await inBatches(story.orders, (batch) =>
      prisma.order.createMany({
        data: batch.map((o) => {
          const relationship = roster[o.customerIndex];
          const address = relationship.deliveryLine1
            ? { line1: relationship.deliveryLine1, city: relationship.deliveryCity, postcode: relationship.deliveryPostcode, country: relationship.deliveryCountry }
            : undefined;
          const accepted = o.acceptedAt !== null;
          const tax = taxPence(o);
          return {
            id: o.id,
            distributorId: DISTRIBUTOR_ID,
            traderCustomerId: o.organisationId,
            placedByUserId: relationship.customer.memberships[0]?.userId ?? admin.userId,
            orderNumber: orderNumber.get(o.id)!,
            status: o.status,
            acceptanceModeSnapshot: 'MANUAL',
            acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
            currency: 'GBP',
            subtotalAmount: pounds(o.subtotalPence),
            taxAmount: pounds(tax),
            totalAmount: pounds(o.subtotalPence + tax),
            billingAddressSnapshot: address,
            deliveryAddressSnapshot: address,
            requestedDeliveryDate: o.deliveryDate,
            scheduledDeliveryDate: o.runId ? o.deliveryDate : null,
            submittedAt: o.submittedAt,
            acceptedAt: o.acceptedAt,
            acceptedByActorType: accepted ? 'USER' : null,
            acceptedByUserId: accepted ? admin.userId : null,
            rejectedAt: o.status === 'REJECTED' ? o.closedAt : null,
            rejectedByUserId: o.status === 'REJECTED' ? admin.userId : null,
            rejectionReason: o.status === 'REJECTED' ? 'Out of stock on two lines — asked the customer to reorder' : null,
            cancelledAt: o.status === 'CANCELLED' ? o.closedAt : null,
            cancelledByUserId: o.status === 'CANCELLED' ? admin.userId : null,
            cancellationReason: o.status === 'CANCELLED' ? 'Entered twice in error' : null,
            createdAt: o.submittedAt,
            updatedAt: lastEventAt(o),
          } satisfies Prisma.OrderCreateManyInput;
        }),
      }),
    );

    const lines = story.orders.flatMap((o) =>
      o.lines.map((l) => {
        const product = productById.get(l.productId)!;
        const rate = Number(product.taxType?.ratePercentage ?? 0);
        const tax = Math.round((l.subtotalPence * rate) / 100);
        return {
          id: l.id,
          orderId: o.id,
          distributorId: DISTRIBUTOR_ID,
          traderCustomerId: o.organisationId,
          productId: l.productId,
          skuSnapshot: product.sku,
          productNameSnapshot: product.name,
          quantityOrdered: l.quantity,
          unitPriceSnapshot: pounds(l.unitPricePence),
          subtotalAmount: pounds(l.subtotalPence),
          taxAmount: pounds(tax),
          totalAmount: pounds(l.subtotalPence + tax),
          priceListIdSnapshot: priceList?.id ?? null,
          taxTypeId: product.taxType?.id ?? null,
          taxTypeNameSnapshot: product.taxType?.name ?? null,
          taxClassificationSnapshot: product.taxType?.classification ?? null,
          taxRatePercentageSnapshot: product.taxType?.ratePercentage ?? null,
          status: LINE_STATUS[o.status],
          createdAt: o.submittedAt,
          updatedAt: o.submittedAt,
        } satisfies Prisma.OrderLineCreateManyInput;
      }),
    );
    await inBatches(lines, (batch) => prisma.orderLine.createMany({ data: batch }));

    await inBatches(story.runs, (batch) =>
      prisma.deliveryRun.createMany({
        data: batch.map((run) => ({
          id: run.id,
          distributorId: DISTRIBUTOR_ID,
          routeId: routes[run.routeIndex].id,
          deliveryDate: run.deliveryDate,
          name: routes[run.routeIndex].name,
          driverName: routes[run.routeIndex].defaultDriverName,
          status: run.status,
          readyAt: run.readyAt,
          readyByUserId: run.readyAt ? admin.userId : null,
          createdAt: new Date(run.deliveryDate.getTime() - DAY_MS),
        })),
      }),
    );
    const allocated = story.orders.filter((o) => o.runId);
    await inBatches(allocated, (batch) =>
      prisma.deliveryRunOrder.createMany({
        data: batch.map((o) => ({ runId: o.runId!, orderId: o.id, deliverySequence: o.sequence, allocationSource: 'DEFAULT_ROUTE' as const, assignedAt: o.acceptedAt! })),
      }),
    );

    const attempted = story.orders.filter((o) => o.outcome);
    // What the driver captured at the door. A failed attempt has an outcome but no evidence.
    const evidence = new Map<string, DemoEvidence>();
    for (const o of attempted) {
      if (o.outcome!.outcome !== 'DELIVERED') continue;
      evidence.set(o.id, deliveryEvidence({ customerIndex: o.customerIndex, deliveryDate: o.deliveryDate, recordedAt: o.outcome!.recordedAt, city: roster[o.customerIndex].deliveryCity }));
    }
    const outcomeId = (o: DemoOrder): string => `${o.id}-outcome`;
    // Signatures make these rows a few kilobytes each, so they go in smaller batches than the rest.
    for (let i = 0; i < attempted.length; i += 200) {
      await prisma.orderDeliveryOutcome.createMany({
        data: attempted.slice(i, i + 200).map((o) => {
          const captured = evidence.get(o.id);
          const recordedAt = o.outcome!.recordedAt;
          return {
            id: outcomeId(o),
            orderId: o.id,
            outcome: o.outcome!.outcome,
            unableReason: o.outcome!.unableReason,
            dropMethod: captured?.dropMethod ?? null,
            recipientName: captured?.recipientName ?? null,
            notes: captured?.notes ?? null,
            signature: (captured?.signature ?? undefined) as Prisma.InputJsonValue | undefined,
            capturedAt: recordedAt,
            latitude: captured?.location?.latitude ?? null,
            longitude: captured?.location?.longitude ?? null,
            locationAccuracyM: captured?.location?.accuracyM ?? null,
            locationCapturedAt: captured?.location ? new Date(recordedAt.getTime() - 20_000) : null,
            locationUnavailable: !captured?.location,
            recordedAt,
          } satisfies Prisma.OrderDeliveryOutcomeCreateManyInput;
        }),
      });
    }

    const withEvidence = attempted.filter((o) => evidence.has(o.id));
    await inBatches(withEvidence, (batch) =>
      prisma.orderDeliveryPhoto.createMany({
        data: batch.map((o) => {
          const object = proofPhotos.get(evidence.get(o.id)!.photo)!;
          // Taken a moment before the outcome was submitted, as the driver app uploads photos first.
          const takenAt = new Date(o.outcome!.recordedAt.getTime() - 45_000);
          return {
            id: `${o.id}-photo`,
            orderId: o.id,
            distributorId: DISTRIBUTOR_ID,
            outcomeId: outcomeId(o),
            variants: object.variants,
            sourceMimeType: 'image/jpeg',
            sourceSizeBytes: object.sizeBytes,
            sourceWidth: object.width,
            sourceHeight: object.height,
            capturedAt: takenAt,
            createdAt: takenAt,
          } satisfies Prisma.OrderDeliveryPhotoCreateManyInput;
        }),
      }),
    );

    // The facts, exactly as the analytics consumer would have recorded them from the events.
    const orderFacts: Prisma.OrderFactCreateManyInput[] = [];
    const fact = (o: DemoOrder, suffix: string, eventType: string, resultingStatus: OrderStatus, occurredAt: Date): void => {
      orderFacts.push({
        eventId: `${o.id}:${suffix}`, distributorId: DISTRIBUTOR_ID, orderId: o.id, traderCustomerId: o.organisationId, eventType, resultingStatus,
        subtotalAmount: pounds(o.subtotalPence), occurredAt, distributorLocalDate: localDate(occurredAt),
      });
    };
    for (const o of story.orders) {
      fact(o, 'submitted', 'OrderSubmitted', 'SUBMITTED', o.submittedAt);
      if (o.acceptedAt) fact(o, 'accepted', 'OrderAccepted', 'ACCEPTED', o.acceptedAt);
      if (o.status === 'REJECTED') fact(o, 'rejected', 'OrderRejected', 'REJECTED', o.closedAt!);
      if (o.status === 'CANCELLED') fact(o, 'cancelled', 'OrderCancelled', 'CANCELLED', o.closedAt!);
      if (o.outcome) {
        const delivered = o.outcome.outcome === 'DELIVERED';
        fact(o, 'delivery', delivered ? 'OrderDelivered' : 'OrderDeliveryFailed', delivered ? 'DELIVERED' : 'DELIVERY_FAILED', o.outcome.recordedAt);
      }
    }
    await inBatches(orderFacts, (batch) => prisma.orderFact.createMany({ data: batch }));

    const lineFacts = story.orders.flatMap((o) =>
      o.lines.map((l) => ({
        eventId: `${o.id}:submitted`, orderLineId: l.id, distributorId: DISTRIBUTOR_ID, orderId: o.id, productId: l.productId, traderCustomerId: o.organisationId,
        quantity: l.quantity, netValue: pounds(l.subtotalPence), occurredAt: o.submittedAt, distributorLocalDate: localDate(o.submittedAt),
      })),
    );
    await inBatches(lineFacts, (batch) => prisma.orderLineFact.createMany({ data: batch }));

    await inBatches(story.orders, (batch) =>
      prisma.orderAnalyticsState.createMany({
        data: batch.map((o) => ({
          orderId: o.id, distributorId: DISTRIBUTOR_ID, traderCustomerId: o.organisationId, status: o.status, subtotalAmount: pounds(o.subtotalPence),
          distributorLocalDate: localDate(o.submittedAt), lastEventAt: lastEventAt(o),
        })),
      }),
    );

    await inBatches(attempted, (batch) =>
      prisma.deliveryFact.createMany({
        data: batch.map((o) => ({
          eventId: `${o.id}:delivery`, distributorId: DISTRIBUTOR_ID, orderId: o.id, traderCustomerId: o.organisationId,
          outcome: o.outcome!.outcome, unableReason: o.outcome!.unableReason,
          dropMethod: evidence.get(o.id)?.dropMethod ?? null,
          committedDate: o.deliveryDate, requestedDate: o.deliveryDate, routeId: routes[o.routeIndex].id, runId: o.runId,
          occurredAt: o.outcome!.recordedAt, distributorLocalDate: localDate(o.outcome!.recordedAt),
        })),
      }),
    );

    const auditEntries = await writeOrderAuditTrail(prisma);

    console.log(`Wrote ${story.orders.length} orders (${lines.length} lines), ${story.runs.length} delivery runs, ${attempted.length} delivery outcomes (${withEvidence.length} with a proof photo, ${[...evidence.values()].filter((e) => e.signature).length} signed for), ${auditEntries} audit entries for "${distributor.name}".`);

    // ── Check the dashboards now say what the story intends, using the services that feed them ──
    const health = await new CustomerHealthService(prisma, new CustomerPaymentsService(prisma)).getHealth(DISTRIBUTOR_ID);
    const overview = await new DeliveryOverviewService(prisma).getOverview(DISTRIBUTOR_ID);
    const [orderStatuses, stateStatuses] = await Promise.all([
      prisma.order.groupBy({ by: ['status'], where: { distributorId: DISTRIBUTOR_ID }, _count: true, _sum: { subtotalAmount: true } }),
      prisma.orderAnalyticsState.groupBy({ by: ['status'], where: { distributorId: DISTRIBUTOR_ID }, _count: true, _sum: { subtotalAmount: true } }),
    ]);
    const shape = (rows: Array<{ status: OrderStatus; _count: number; _sum: { subtotalAmount: Prisma.Decimal | null } }>) =>
      rows.map((r) => `${r.status}:${r._count}:${r._sum.subtotalAmount}`).sort().join(' ');

    console.log('\nCustomers');
    console.log(`  active (90 days): ${health.tiles.activeCustomers90d}   healthy ${health.tierCounts.healthy} / watch ${health.tierCounts.watch} / at risk ${health.tierCounts.at_risk}`);
    console.log(`  sales, last 30 days: £${Math.round(health.tiles.salesLast30d).toLocaleString('en-GB')}   top 5 share (90 days): ${Math.round((health.salesConcentration.top5Share ?? 0) * 100)}%`);
    for (const c of health.needingAttention) console.log(`  ${c.tier === 'at_risk' ? 'AT RISK' : 'watch  '} ${c.customerName}: ${c.reasons.map((r) => r.text).join('; ')}`);
    console.log('\nDelivery, today');
    console.log(`  planned ${overview.progress.planned} = delivered ${overview.progress.delivered} + failed ${overview.progress.failed} + remaining ${overview.progress.remaining}`);
    for (const run of overview.runs) console.log(`  ${run.name} (${run.driverName ?? 'no driver'}): ${run.attemptedCount} of ${run.stopCount} drops`);
    console.log(`  to accept ${overview.counts.toAccept.count}, overdue ${overview.counts.overdue.count}, not on a run ${overview.counts.notOnRun.count}, failed in last 24h ${overview.counts.failedLast24h.count}`);

    const problems: string[] = [];
    const expect = (label: string, actual: number, expected: number): void => {
      if (actual !== expected) problems.push(`${label}: expected ${expected}, got ${actual}`);
    };
    expect('active customers', health.tiles.activeCustomers90d, DEMO_CUSTOMER_COUNT);
    expect('customers at risk', health.tierCounts.at_risk, 3);
    expect("today's runs", overview.runs.length, TODAY_RUNS.length);
    expect("today's drops", overview.progress.planned, TODAY_RUNS.reduce((total, r) => total + r.drops, 0));
    expect('orders to accept', overview.counts.toAccept.count, TODAY_TO_ACCEPT);
    expect('not on a run', overview.counts.notOnRun.count, 0);
    if (shape(orderStatuses) !== shape(stateStatuses)) problems.push('order_analytics_state does not match the orders table');
    if (problems.length) throw new Error(`The data was written but does not tell the intended story:\n  ${problems.join('\n  ')}`);
    console.log('\nAll checks passed.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
