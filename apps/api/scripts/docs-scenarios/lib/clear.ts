import { Prisma, PrismaClient } from '@prisma/client';
import { DOCS_DISTRIBUTOR_ID, DOCS_ONBOARDING_SLUGS, DOCS_USERS } from './ids';

/**
 * Deletes everything that belongs to the docs distributors (Vine & Co, plus any business
 * a docs run created through onboarding under one of DOCS_ONBOARDING_SLUGS): their own rows, the customer
 * organisations that only trade with it, and the users whose only memberships were in
 * those organisations. Nothing else is touched.
 *
 * Which tables to clear is worked out from the Prisma schema, not a hand-kept list, so a
 * table added later is covered without anyone remembering to add it here. A row belongs to
 * the docs world when it carries the docs distributor id, one of the docs organisation or
 * user ids, or points (up to two relations away) at a row that does.
 *
 * Almost every foreign key is RESTRICT, so the order of deletes matters. Rather than keep
 * an order by hand, deletes are repeated in passes: a delete blocked by a child succeeds
 * on a later pass once the child has gone. The passes run outside a transaction (a failed
 * statement aborts a Postgres transaction), which is safe here because the whole thing is
 * repeatable: running it again finishes whatever an interrupted run left.
 */

type Where = Record<string, unknown>;
type Delegate = { deleteMany(args: { where: Where }): Promise<{ count: number }>; count(args: { where: Where }): Promise<number> };

interface World {
  distributorIds: string[];
  organisationIds: string[];
  customerOrganisationIds: string[];
  userIds: string[];
  aggregateIds: string[];
}

const MAX_PASSES = 25;

export async function clearDocsWorld(prisma: PrismaClient, log: (line: string) => void = () => {}): Promise<number> {
  const world = await collectWorld(prisma);
  const scopes = buildScopes(world);

  let total = 0;
  for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
    let deletedThisPass = 0;
    let blocked = 0;
    for (const { model, where } of scopes) {
      try {
        const { count } = await delegate(prisma, model).deleteMany({ where });
        deletedThisPass += count;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
          blocked += 1; // a child row still points at it; a later pass will get it
          continue;
        }
        throw e;
      }
    }
    total += deletedThisPass;
    if (blocked === 0) {
      log(`Cleared ${total} rows in ${pass} pass${pass === 1 ? '' : 'es'}.`);
      return total;
    }
    if (deletedThisPass === 0) break;
  }

  const left: string[] = [];
  for (const { model, where } of scopes) {
    const n = await delegate(prisma, model).count({ where });
    if (n > 0) left.push(`${model}: ${n}`);
  }
  throw new Error(`Could not clear the docs data; rows still blocked:\n  ${left.join('\n  ')}`);
}

/** Rows still belonging to the docs world, per table (empty when fully cleared). */
export async function remainingDocsRows(prisma: PrismaClient): Promise<Record<string, number>> {
  const world = await collectWorld(prisma);
  const result: Record<string, number> = {};
  for (const { model, where } of buildScopes(world)) {
    const n = await delegate(prisma, model).count({ where });
    if (n > 0) result[model] = n;
  }
  return result;
}

async function collectWorld(prisma: PrismaClient): Promise<World> {
  const onboarded = await prisma.organisation.findMany({
    where: { slug: { in: [...DOCS_ONBOARDING_SLUGS] }, type: 'DISTRIBUTOR', id: { not: DOCS_DISTRIBUTOR_ID } },
    select: { id: true },
  });
  const distributorIds = [DOCS_DISTRIBUTOR_ID, ...onboarded.map((o) => o.id)];
  const distributorId = { in: distributorIds };

  // Customer organisations that trade with the docs distributor and nobody else.
  const relationships = await prisma.tradeRelationship.findMany({
    where: { distributorId },
    select: { id: true, customerId: true },
  });
  const candidateCustomers = [...new Set(relationships.map((r) => r.customerId))];
  const sharedWithOthers = await prisma.tradeRelationship.findMany({
    where: { customerId: { in: candidateCustomers }, distributorId: { notIn: distributorIds } },
    select: { customerId: true },
  });
  const shared = new Set(sharedWithOthers.map((r) => r.customerId));
  const customerOrganisationIds = candidateCustomers.filter((id) => !shared.has(id));

  const existing = await prisma.organisation.findMany({ where: { id: distributorId }, select: { id: true } });
  const organisationIds = [...existing.map((o) => o.id), ...customerOrganisationIds];

  // Users whose every membership is in a docs organisation (the docs sign-in users included).
  const members = await prisma.membership.findMany({
    where: { organisationId: { in: organisationIds } },
    select: { userId: true },
  });
  const memberIds = [...new Set(members.map((m) => m.userId))];
  const elsewhere = await prisma.membership.findMany({
    where: { userId: { in: memberIds }, organisationId: { notIn: organisationIds } },
    select: { userId: true },
  });
  const keep = new Set(elsewhere.map((m) => m.userId));
  // Docs users by id, plus the docs sign-ins however they were created (onboarding makes
  // the owner's user with a generated id).
  const docsUsers = await prisma.user.findMany({
    where: { OR: [{ id: { startsWith: 'docs-' } }, { keycloakId: { in: Object.values(DOCS_USERS).map((u) => u.keycloakId) } }] },
    select: { id: true },
  });
  const userIds = [...new Set([...memberIds.filter((id) => !keep.has(id)), ...docsUsers.map((u) => u.id)])];

  // Outbox events carry no distributor column, only the id of what they're about.
  const [orders, runs, products] = await Promise.all([
    prisma.order.findMany({ where: { distributorId }, select: { id: true } }),
    prisma.deliveryRun.findMany({ where: { distributorId }, select: { id: true } }),
    prisma.product.findMany({ where: { distributorId }, select: { id: true } }),
  ]);
  const aggregateIds = [
    ...organisationIds,
    ...relationships.map((r) => r.id),
    ...orders.map((o) => o.id),
    ...runs.map((r) => r.id),
    ...products.map((p) => p.id),
  ];

  return { distributorIds, organisationIds, customerOrganisationIds, userIds, aggregateIds };
}

/** One deleteMany filter per table that can hold docs rows. Organisations and users last. */
function buildScopes(world: World): Array<{ model: string; where: Where }> {
  const models = Prisma.dmmf.datamodel.models;
  const byName = new Map(models.map((m) => [m.name, m]));

  // Filters a table can satisfy from its own columns.
  const direct = (modelName: string): Where[] => {
    const model = byName.get(modelName);
    if (!model) return [];
    const scalars = new Set(model.fields.filter((f) => f.kind === 'scalar').map((f) => f.name));
    const ors: Where[] = [];
    if (scalars.has('distributorId')) ors.push({ distributorId: { in: world.distributorIds } });
    if (scalars.has('organisationId')) ors.push({ organisationId: { in: world.organisationIds } });
    if (scalars.has('traderCustomerId')) ors.push({ traderCustomerId: { in: world.customerOrganisationIds } });
    if (scalars.has('customerId') && modelName !== 'TradeRelationship') {
      ors.push({ customerId: { in: world.customerOrganisationIds } });
    }
    if (scalars.has('userId')) ors.push({ userId: { in: world.userIds } });
    if (modelName === 'OutboxEvent') ors.push({ aggregateId: { in: world.aggregateIds } });
    return ors;
  };

  // Filters reached through a to-one relation, up to `depth` hops away.
  const viaRelations = (modelName: string, depth: number): Where[] => {
    if (depth === 0) return [];
    const model = byName.get(modelName);
    if (!model) return [];
    const ors: Where[] = [];
    for (const field of model.fields) {
      if (field.kind !== 'object' || field.isList || !field.relationFromFields?.length) continue;
      if (field.type === 'Organisation' || field.type === 'User') continue; // covered by the id columns
      const target = [...direct(field.type), ...viaRelations(field.type, depth - 1)];
      if (target.length) ors.push({ [field.name]: { OR: target } });
    }
    return ors;
  };

  const scopes: Array<{ model: string; where: Where }> = [];
  for (const model of models) {
    if (model.name === 'Organisation' || model.name === 'User') continue;
    const ors = [...direct(model.name), ...viaRelations(model.name, 2)];
    if (ors.length) scopes.push({ model: model.name, where: { OR: ors } });
  }
  scopes.push({ model: 'Organisation', where: { id: { in: world.organisationIds } } });
  scopes.push({ model: 'User', where: { id: { in: world.userIds } } });
  return scopes;
}

function delegate(prisma: PrismaClient, model: string): Delegate {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  return (prisma as unknown as Record<string, Delegate>)[key];
}
