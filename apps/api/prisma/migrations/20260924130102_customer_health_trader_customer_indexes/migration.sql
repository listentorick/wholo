-- CreateIndex
CREATE INDEX "delivery_facts_distributorId_traderCustomerId_occurredAt_idx" ON "delivery_facts"("distributorId", "traderCustomerId", "occurredAt");

-- CreateIndex
CREATE INDEX "order_facts_distributorId_traderCustomerId_occurredAt_idx" ON "order_facts"("distributorId", "traderCustomerId", "occurredAt");

-- CreateIndex
CREATE INDEX "order_line_facts_distributorId_traderCustomerId_occurredAt_idx" ON "order_line_facts"("distributorId", "traderCustomerId", "occurredAt");
