/**
 * Seed a default 0% TaxType per distributor and backfill it onto every
 * existing product with no taxTypeId (Xero tax types PBI, Phase 1).
 *
 * Existing products predate the TaxType concept entirely, so there is
 * nothing to migrate them *from* — this creates one system default per
 * distributor ("Unassigned (0%)", isDefault: true) and points every
 * taxTypeId-less product at it, so nothing is blocked by the new
 * ACTIVE-requires-a-tax-type publish gate. Idempotent: safe to re-run.
 *
 * Usage: pnpm --filter @wholo/api db:tax-types:backfill
 * Requires DATABASE_URL (port-forward Postgres first: pnpm k8s:pf:postgres).
 */
import { TaxClassification } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const distributors = await prisma.organisation.findMany({
      where: { products: { some: { taxTypeId: null } } },
      select: { id: true, name: true },
    });

    let distributorsSeeded = 0;
    let productsBackfilled = 0;

    for (const distributor of distributors) {
      let defaultTaxType = await prisma.taxType.findFirst({
        where: { distributorId: distributor.id, isDefault: true },
      });

      if (!defaultTaxType) {
        defaultTaxType = await prisma.taxType.create({
          data: {
            distributorId: distributor.id,
            name: 'Unassigned (0%)',
            classification: TaxClassification.OUTSIDE_SCOPE,
            ratePercentage: 0,
            active: true,
            isDefault: true,
          },
        });
        distributorsSeeded++;
      }

      const result = await prisma.product.updateMany({
        where: { distributorId: distributor.id, taxTypeId: null },
        data: { taxTypeId: defaultTaxType.id },
      });
      productsBackfilled += result.count;

      console.log(
        `${distributor.name} (${distributor.id}): default tax type ${defaultTaxType.id}, backfilled ${result.count} product(s).`,
      );
    }

    console.log(
      `Done. Seeded ${distributorsSeeded} default tax type(s), backfilled ${productsBackfilled} product(s) across ${distributors.length} distributor(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
