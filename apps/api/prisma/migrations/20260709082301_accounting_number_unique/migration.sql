-- One active account number per distributor. Prisma's schema DSL cannot
-- express a WHERE clause on a unique index, so this constraint exists only
-- in migration SQL, never in schema.prisma — same precedent as
-- unique_active_accounting_connection and the CustomerAccountingMapping
-- partial indexes (Postgres already treats every NULL as distinct for
-- uniqueness purposes, so customers with no account number set are
-- unaffected; only non-null duplicates for the same distributor are
-- rejected).
CREATE UNIQUE INDEX "unique_active_account_number"
ON "trade_relationships"("distributorId", "accountNumber")
WHERE "deletedAt" IS NULL;
