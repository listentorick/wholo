import { ActorType, DeliveryAllocationSource, OrderStatus, OrganisationType, PrismaClient, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { buildProductSearchText, normalise } from '../../../src/product-search/product-search.util';
import { RELATIONSHIP_EVENTS, relationshipEventFields } from '../../../src/common/relationship-events';
import { BASE_IDS, DOCS_DISTRIBUTOR_ID, DOCS_USERS } from './ids';

/**
 * Small builders for scenario seeds. Each writes rows the way the app would (search
 * documents for products, audit entries for orders), so the admin app and portal show
 * seeded records exactly like ones made through the UI.
 */

const D = DOCS_DISTRIBUTOR_ID;
const VAT_RATE = 20;

export interface Address {
  line1: string;
  city: string;
  postcode: string;
  country?: string;
}

// ─── Dates ────────────────────────────────────────────────────────────────

/** Midday UTC, `days` from today. */
export function daysFromToday(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

/** The first given weekday (1 = Monday … 7 = Sunday) at least `minDaysAhead` days away. */
export function nextWeekday(weekday: number, minDaysAhead = 1): Date {
  for (let i = minDaysAhead; i < minDaysAhead + 7; i += 1) {
    const d = daysFromToday(i);
    const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (dow === weekday) return d;
  }
  throw new Error('unreachable');
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Products and catalogues ──────────────────────────────────────────────

export type ProductTypeKey = keyof typeof BASE_IDS.productType;
export type SupplierKey = keyof typeof BASE_IDS.supplier;

export interface ProductSpec {
  id: string;
  name: string;
  sku: string;
  price: string;
  type: ProductTypeKey;
  supplier: SupplierKey;
  description?: string;
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
}

export async function addProducts(prisma: PrismaClient, specs: ProductSpec[]): Promise<void> {
  for (const p of specs) {
    const product = await prisma.product.create({
      data: {
        id: p.id,
        distributorId: D,
        name: p.name,
        sku: p.sku,
        price: p.price,
        description: p.description ?? null,
        status: p.status ?? 'ACTIVE',
        productTypeId: BASE_IDS.productType[p.type],
        supplierId: BASE_IDS.supplier[p.supplier],
        taxTypeId: BASE_IDS.taxStandardVat,
      },
    });
    const searchText = buildProductSearchText(product);
    await prisma.productSearchDocument.create({
      data: {
        productId: product.id,
        distributorId: D,
        searchText,
        searchTextNormalised: normalise(searchText),
        nameNormalised: normalise(product.name),
        skuNormalised: product.sku ? normalise(product.sku) : null,
      },
    });
  }
}

export async function addCatalogue(
  prisma: PrismaClient,
  spec: { id: string; name: string; description?: string; productIds: string[] },
): Promise<void> {
  await prisma.catalogue.create({
    data: { id: spec.id, distributorId: D, name: spec.name, description: spec.description ?? null },
  });
  if (spec.productIds.length) {
    await prisma.catalogueProduct.createMany({
      data: spec.productIds.map((productId) => ({ catalogueId: spec.id, productId })),
    });
  }
}

// ─── Delivery ─────────────────────────────────────────────────────────────

export async function addDeliveryProfile(
  prisma: PrismaClient,
  spec: { id: string; name: string; weekdays: number[]; cutoffTime?: string; processingDays?: number },
): Promise<void> {
  await prisma.deliveryProfile.create({
    data: {
      id: spec.id,
      distributorId: D,
      name: spec.name,
      active: true,
      defaultWeekdays: spec.weekdays,
      defaultCutoffTime: spec.cutoffTime ?? '17:00',
      defaultCutoffProcessingDays: spec.processingDays ?? 1,
    },
  });
}

export interface RouteSpec {
  id: string;
  name: string;
  code?: string;
  defaultDriverName?: string;
  /** In drop order: the first customer is drop 1. */
  customers: Customer[];
}

/** A delivery route with its customers in drop order, as built on the Delivery Routes page. */
export async function addRoute(prisma: PrismaClient, spec: RouteSpec): Promise<void> {
  const owner = await prisma.user.findUniqueOrThrow({ where: { keycloakId: DOCS_USERS.owner.keycloakId } });
  await prisma.deliveryRoute.create({
    data: {
      id: spec.id,
      distributorId: D,
      name: spec.name,
      code: spec.code ?? null,
      defaultDriverName: spec.defaultDriverName ?? null,
    },
  });
  // activeDistributorCustomerId is kept by a database trigger.
  for (const [i, c] of spec.customers.entries()) {
    await prisma.deliveryRouteCustomer.create({
      data: { routeId: spec.id, customerId: c.organisationId, defaultDropPosition: i + 1, assignedByUserId: owner.id },
    });
  }
}

/**
 * A route's run for one day holding accepted orders, as accepting them would have made
 * it (DeliveryRunAllocationService.allocateOrder): named after the route, with the
 * route's default driver, each order at its customer's drop position. Status OPEN.
 */
export async function addRun(
  prisma: PrismaClient,
  spec: { id: string; routeId: string; deliveryDate: Date; orderIds: string[] },
): Promise<void> {
  const route = await prisma.deliveryRoute.findUniqueOrThrow({
    where: { id: spec.routeId },
    include: { customers: { where: { removedAt: null } } },
  });
  const deliveryDate = new Date(`${isoDate(spec.deliveryDate)}T00:00:00.000Z`);
  await prisma.deliveryRun.create({
    data: { id: spec.id, distributorId: D, routeId: route.id, deliveryDate, name: route.name, driverName: route.defaultDriverName },
  });
  for (const orderId of spec.orderIds) {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status !== OrderStatus.ACCEPTED) throw new Error(`Run ${spec.id}: order ${order.orderNumber} is not accepted`);
    const stop = route.customers.find((c) => c.customerId === order.traderCustomerId);
    if (!stop) throw new Error(`Run ${spec.id}: ${order.orderNumber}'s customer is not on route ${route.name}`);
    // activeOrderId is kept by a database trigger.
    await prisma.deliveryRunOrder.create({
      data: {
        runId: spec.id,
        orderId,
        deliverySequence: stop.defaultDropPosition,
        allocationSource: DeliveryAllocationSource.DEFAULT_ROUTE,
      },
    });
  }
}

// ─── Pricing ──────────────────────────────────────────────────────────────

/** A price list with no rules (customers on it pay the product's own price). */
export async function addPriceList(prisma: PrismaClient, spec: { id: string; name: string; description?: string }): Promise<void> {
  await prisma.priceList.create({
    data: { id: spec.id, distributorId: D, name: spec.name, description: spec.description ?? null, currency: 'GBP' },
  });
}

// ─── Customers ────────────────────────────────────────────────────────────

export interface CustomerSpec {
  /** Short key; ids are derived from it. */
  key: string;
  name: string;
  accountNumber: string;
  email: string;
  phone?: string;
  address: Address;
  contact: { firstName: string; lastName: string };
  deliveryProfileId?: string;
  catalogueIds?: string[];
  /** Give the docs portal buyer (Peter Walsh) a login to this customer. */
  portalBuyer?: boolean;
  /**
   * No contact user at all, as when the owner adds a customer in the app. For a customer who
   * will sign up through an invitation: a contact user would hold their email address, and
   * the sign-up would then be refused as a duplicate.
   */
  noContact?: boolean;
  /** Pending invite: added, not yet active (as "Done and activate later" leaves it). Default Active. */
  status?: 'ACTIVE' | 'PENDING_INVITE';
}

export interface Customer {
  organisationId: string;
  relationshipId: string;
  /** Null for a customer added with `noContact`. */
  contactUserId: string | null;
  address: Address;
}

export async function addCustomer(prisma: PrismaClient, spec: CustomerSpec): Promise<Customer> {
  const organisationId = `docs-cust-${spec.key}`;
  const address = { country: 'United Kingdom', ...spec.address };

  await prisma.organisation.create({
    data: {
      id: organisationId,
      name: spec.name,
      type: OrganisationType.TRADE_CUSTOMER,
      email: spec.email,
      phone: spec.phone ?? null,
      addressLine1: address.line1,
      addressCity: address.city,
      addressPostcode: address.postcode,
      addressCountry: address.country,
    },
  });

  let contactUserId: string | null = null;
  if (spec.noContact) {
    // nobody yet: the invited customer creates their own login
  } else if (spec.portalBuyer) {
    const buyer = await prisma.user.findUniqueOrThrow({ where: { keycloakId: DOCS_USERS.buyer.keycloakId } });
    contactUserId = buyer.id;
  } else {
    // A contact with no sign-in, so orders have someone to be placed by (as in the demo seed).
    const contact = await prisma.user.create({
      data: { id: `docs-user-${spec.key}`, email: spec.email, firstName: spec.contact.firstName, lastName: spec.contact.lastName },
    });
    contactUserId = contact.id;
  }
  if (contactUserId) {
    await prisma.membership.create({
      data: {
        userId: contactUserId,
        organisationId,
        role: Role.TRADE_CUSTOMER,
        roles: { create: { role: Role.TRADE_CUSTOMER } },
      },
    });
  }

  const relationshipId = `docs-rel-${spec.key}`;
  await prisma.tradeRelationship.create({
    data: {
      id: relationshipId,
      distributorId: D,
      customerId: organisationId,
      status: spec.status ?? 'ACTIVE',
      accountNumber: spec.accountNumber,
      activeAccountNumber: spec.accountNumber,
      deliveryLine1: address.line1,
      deliveryCity: address.city,
      deliveryPostcode: address.postcode,
      deliveryCountry: address.country,
    },
  });
  await prisma.traderCustomerSettings.create({
    data: {
      id: `docs-tcs-${spec.key}`,
      tradeRelationshipId: relationshipId,
      priceListId: BASE_IDS.priceListStandard,
      deliveryProfileId: spec.deliveryProfileId ?? null,
    },
  });
  if (spec.catalogueIds?.length) {
    await prisma.customerCatalogue.createMany({
      data: spec.catalogueIds.map((catalogueId) => ({ tradeRelationshipId: relationshipId, catalogueId })),
    });
  }

  return { organisationId, relationshipId, contactUserId, address };
}

// ─── Orders ───────────────────────────────────────────────────────────────

export interface OrderSpec {
  id: string;
  /** Unique; kept well above the app's own order-number sequence. */
  orderNumber: string;
  customer: Customer;
  status: 'SUBMITTED' | 'ACCEPTED';
  lines: Array<{ productId: string; quantity: number }>;
  deliveryDate: Date;
  customerReference?: string;
  notes?: string;
  submittedDaysAgo?: number;
}

/** An order as the portal would have submitted it (and, if ACCEPTED, as James accepted it). */
export async function addOrder(prisma: PrismaClient, spec: OrderSpec): Promise<void> {
  const placedBy = spec.customer.contactUserId;
  if (!placedBy) throw new Error(`Order ${spec.orderNumber}: the customer has no contact to place it (added with noContact)`);
  const products = await prisma.product.findMany({
    where: { id: { in: spec.lines.map((l) => l.productId) } },
    include: { taxType: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines = spec.lines.map((l) => {
    const p = byId.get(l.productId);
    if (!p || p.price == null) throw new Error(`Order ${spec.orderNumber}: product ${l.productId} missing or unpriced`);
    const unit = Number(p.price);
    const subtotal = round(unit * l.quantity);
    const tax = round((subtotal * VAT_RATE) / 100);
    return { p, quantity: l.quantity, unit, subtotal, tax, total: round(subtotal + tax) };
  });
  const subtotal = round(lines.reduce((s, l) => s + l.subtotal, 0));
  const tax = round(lines.reduce((s, l) => s + l.tax, 0));

  const accepted = spec.status === 'ACCEPTED';
  const submittedAt = spec.submittedDaysAgo != null ? daysFromToday(-spec.submittedDaysAgo) : new Date(Date.now() - 2 * 3600_000);
  const owner = await prisma.user.findUniqueOrThrow({ where: { keycloakId: DOCS_USERS.owner.keycloakId } });
  const address = { ...spec.customer.address, country: spec.customer.address.country ?? 'United Kingdom' };

  await prisma.order.create({
    data: {
      id: spec.id,
      distributorId: D,
      traderCustomerId: spec.customer.organisationId,
      placedByUserId: placedBy,
      orderNumber: spec.orderNumber,
      status: accepted ? OrderStatus.ACCEPTED : OrderStatus.SUBMITTED,
      acceptanceModeSnapshot: 'MANUAL',
      acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
      currency: 'GBP',
      subtotalAmount: subtotal,
      taxAmount: tax,
      totalAmount: round(subtotal + tax),
      billingAddressSnapshot: address,
      deliveryAddressSnapshot: address,
      requestedDeliveryDate: spec.deliveryDate,
      scheduledDeliveryDate: accepted ? spec.deliveryDate : null,
      customerReference: spec.customerReference ?? null,
      notes: spec.notes ?? null,
      submittedAt,
      ...(accepted && { acceptedAt: new Date(submittedAt.getTime() + 3600_000), acceptedByActorType: 'USER', acceptedByUserId: owner.id }),
      lines: {
        create: lines.map((l) => ({
          distributorId: D,
          traderCustomerId: spec.customer.organisationId,
          productId: l.p.id,
          skuSnapshot: l.p.sku,
          productNameSnapshot: l.p.name,
          quantityOrdered: l.quantity,
          unitPriceSnapshot: l.unit,
          subtotalAmount: l.subtotal,
          taxAmount: l.tax,
          totalAmount: l.total,
          taxTypeId: l.p.taxTypeId,
          taxTypeNameSnapshot: l.p.taxType?.name ?? null,
          taxClassificationSnapshot: l.p.taxType?.classification ?? null,
          taxRatePercentageSnapshot: l.p.taxType?.ratePercentage ?? null,
          status: accepted ? 'ACCEPTED' : 'SUBMITTED',
        })),
      },
    },
  });

  const placer = await prisma.user.findUniqueOrThrow({ where: { id: placedBy } });
  await prisma.auditLog.create({
    data: {
      distributorId: D,
      entityType: 'ORDER',
      entityId: spec.id,
      action: 'ORDER_SUBMITTED',
      actorType: ActorType.USER,
      actorUserId: placer.id,
      actorName: `${placer.firstName} ${placer.lastName}`,
      summary: 'Submitted the order',
      createdAt: submittedAt,
    },
  });
  if (accepted) {
    await prisma.auditLog.create({
      data: {
        distributorId: D,
        entityType: 'ORDER',
        entityId: spec.id,
        action: 'ORDER_ACCEPTED',
        actorType: ActorType.USER,
        actorUserId: owner.id,
        actorName: `${owner.firstName} ${owner.lastName}`,
        summary: 'Accepted the order',
        createdAt: new Date(submittedAt.getTime() + 3600_000),
      },
    });
  }
}

/** A delivery-link token for an order, as printing a manifest would set it (ADR-076). */
export async function addDeliveryLink(prisma: PrismaClient, orderId: string): Promise<string> {
  const token = randomBytes(16).toString('base64url');
  await prisma.order.update({ where: { id: orderId }, data: { deliveryLinkToken: token } });
  return token;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Portal invitations ───────────────────────────────────────────────────

/**
 * A portal invitation as the owner's "Send invitation" makes it (AdminCustomersService.invite):
 * the invitation, and the CustomerInviteSent event that has wholo-worker email it. The email
 * arrives in MailHog. Returns the address it was sent to.
 */
export async function addPortalInvitation(prisma: PrismaClient, customer: Customer, email: string): Promise<string> {
  const rel = await prisma.tradeRelationship.findUniqueOrThrow({
    where: { id: customer.relationshipId },
    include: { customer: { select: { name: true } }, distributor: { select: { name: true, email: true, phone: true } } },
  });
  const portalUrl = process.env.DOCS_PORTAL_URL || 'http://localhost:3010';
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    const invitation = await tx.customerInvitation.create({
      data: { tradeRelationshipId: rel.id, distributorId: D, email, token, expiresAt },
    });
    await tx.outboxEvent.create({
      data: {
        aggregateType: 'CustomerInvitation',
        aggregateId: invitation.id,
        eventType: RELATIONSHIP_EVENTS.inviteSent,
        payload: {
          ...relationshipEventFields(rel, rel.status, rel.status, invitation.createdAt),
          invitationId: invitation.id,
          distributorId: D,
          email,
          distributorName: rel.distributor.name,
          distributorEmail: rel.distributor.email,
          distributorPhone: rel.distributor.phone,
          customerName: rel.customer.name,
          inviteUrl: `${portalUrl}/accept-invite?token=${token}`,
          expiresAt: expiresAt.toISOString(),
        },
      },
    });
  });
  return email;
}
