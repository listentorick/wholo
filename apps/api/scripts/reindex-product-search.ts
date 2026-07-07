/**
 * Backfill / rebuild product search documents (ADR-050).
 *
 * Usage: pnpm --filter @wholo/api db:search:reindex
 * Requires DATABASE_URL (port-forward Postgres first: pnpm k8s:pf:postgres).
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductSearchService } from '../src/product-search/product-search.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const service = new ProductSearchService(prisma);
    const count = await service.reindexAll();
    console.log(`Reindexed ${count} products.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
