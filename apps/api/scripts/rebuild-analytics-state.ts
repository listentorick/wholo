/**
 * Rebuild order_analytics_state from the durable order_facts event log
 * (wholesaler homepage dashboard PRD, Foundation phase) — proves the
 * "reproducible from durable facts" exit criterion, and is the recovery path
 * if the live consumer's output is ever found to have drifted (see
 * AnalyticsReconciliationService).
 *
 * Usage: pnpm --filter @wholo/api db:analytics:rebuild [-- --distributorId=<id>]
 * Requires DATABASE_URL (port-forward Postgres first: pnpm k8s:pf:postgres).
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { OrderFactsService } from '../src/analytics-facts/order-facts.service';

async function main() {
  const distributorId = process.argv.find((a) => a.startsWith('--distributorId='))?.split('=')[1];

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const orderFacts = new OrderFactsService(prisma);
    const where = distributorId ? { distributorId } : {};

    await prisma.orderAnalyticsState.deleteMany({ where });

    const facts = await prisma.orderFact.findMany({
      where,
      orderBy: { occurredAt: 'asc' },
    });

    let applied = 0;
    for (const fact of facts) {
      await prisma.$transaction((tx) =>
        orderFacts.upsertAnalyticsState(tx, {
          orderId: fact.orderId,
          distributorId: fact.distributorId,
          traderCustomerId: fact.traderCustomerId,
          status: fact.resultingStatus,
          subtotalAmount: fact.subtotalAmount,
          distributorLocalDate: fact.distributorLocalDate,
          occurredAt: fact.occurredAt,
        }),
      );
      applied++;
    }

    console.log(
      `Rebuilt order_analytics_state from ${applied} order_facts row(s)${distributorId ? ` for distributor ${distributorId}` : ''}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
