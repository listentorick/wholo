/**
 * Clear every accounting-integration row, ahead of the
 * accounting_data_per_organisation migration (ADR-074).
 *
 * That migration re-keys all accounting data from the connection to the new
 * AccountingOrganisation and adds required columns, which Postgres cannot do
 * on a table that has rows. There is no live data worth keeping, so the
 * tables are emptied instead of converted: every distributor reconnects their
 * accounting provider and re-maps afterwards, and existing orders lose their
 * invoice-export record.
 *
 * Run it BEFORE deploying the migration — migrations run automatically on
 * deploy, and against non-empty tables this one fails.
 *
 * Plain JavaScript on purpose: it needs only @prisma/client and DATABASE_URL,
 * so it can be piped into a running api pod (which ships neither scripts/ nor
 * tsx). Only touches tables and columns that exist both before and after the
 * migration, so it runs with either Prisma client. Idempotent.
 *
 * Usage:
 *   Local:  pnpm --filter @wholo/api db:accounting:clear [--yes]
 *           (needs DATABASE_URL; port-forward Postgres first)
 *   Live:   docs/runbook/deploy.md, pre-flight step 5 — piped into the api pod:
 *           kubectl -n wholo exec -i deploy/wholo-api -c api -- node - [--yes] < apps/api/scripts/clear-accounting-data.js
 * Without --yes it is a dry run that only prints counts.
 */
const { PrismaClient } = require('@prisma/client');

// Children before parents, so no foreign key is ever left dangling.
const TABLES = [
  'accountingContactMatchSuggestion',
  'accountingProductMatchSuggestion',
  'accountingTaxTypeMatchSuggestion',
  'customerAccountingMapping',
  'productAccountingMapping',
  'taxTypeAccountingMapping',
  'externalAccountingContact',
  'externalAccountingProduct',
  'externalAccountingTaxType',
  'accountingBulkImportJob',
  'accountingInvoiceExport',
  'accountingConnection',
  'accountingOAuthState',
];

// Sync bookkeeping for accounting pulls (sourceRef = a connection id, ADR-061).
const ACCOUNTING_INGESTION = { sourceType: 'accounting' };

async function main() {
  const apply = process.argv.includes('--yes');
  const prisma = new PrismaClient();
  try {
    for (const table of TABLES) {
      console.log(`${table}: ${await prisma[table].count()}`);
    }
    console.log(`ingestionRun (accounting): ${await prisma.ingestionRun.count({ where: ACCOUNTING_INGESTION })}`);

    if (!apply) {
      console.log('Dry run — nothing deleted. Re-run with --yes to delete.');
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const table of TABLES) {
        const { count } = await tx[table].deleteMany();
        console.log(`Deleted ${count} from ${table}`);
      }
      const { count } = await tx.ingestionRun.deleteMany({ where: ACCOUNTING_INGESTION });
      console.log(`Deleted ${count} from ingestionRun (accounting)`);
    });
    console.log('Done. Accounting data cleared.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
