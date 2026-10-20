-- CreateIndex
CREATE INDEX "invoice_facts_distributorId_customerId_occurredAt_idx" ON "invoice_facts"("distributorId", "customerId", "occurredAt");
