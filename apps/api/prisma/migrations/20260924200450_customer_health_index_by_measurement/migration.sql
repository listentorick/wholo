-- DropIndex
DROP INDEX "delivery_facts_distributorId_traderCustomerId_occurredAt_idx";

-- DropIndex
DROP INDEX "order_facts_distributorId_traderCustomerId_occurredAt_idx";

-- DropIndex
DROP INDEX "order_line_facts_distributorId_traderCustomerId_occurredAt_idx";

-- CreateIndex
CREATE INDEX "order_analytics_state_distributorId_traderCustomerId_distri_idx" ON "order_analytics_state"("distributorId", "traderCustomerId", "distributorLocalDate" DESC);
