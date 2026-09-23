-- CreateTable
CREATE TABLE "delivery_facts" (
    "eventId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "traderCustomerId" TEXT NOT NULL,
    "outcome" "DeliveryOutcomeType" NOT NULL,
    "unableReason" "UnableToDeliverReason",
    "dropMethod" "DeliveryDropMethod",
    "committedDate" DATE,
    "requestedDate" DATE,
    "routeId" TEXT,
    "runId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "distributorLocalDate" DATE NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_facts_pkey" PRIMARY KEY ("eventId","occurredAt")
);

-- CreateIndex
CREATE INDEX "delivery_facts_distributorId_distributorLocalDate_idx" ON "delivery_facts"("distributorId", "distributorLocalDate");

-- CreateIndex
CREATE INDEX "delivery_facts_distributorId_committedDate_idx" ON "delivery_facts"("distributorId", "committedDate");

-- CreateIndex
CREATE INDEX "delivery_facts_orderId_idx" ON "delivery_facts"("orderId");

-- CreateIndex
CREATE INDEX "delivery_facts_occurredAt_idx" ON "delivery_facts"("occurredAt");

-- ConvertToHypertable
-- Append-only event log, same as order_facts (see ADR-052): the primary key
-- already includes occurredAt, which Timescale requires of every unique index
-- on a hypertable. The occurredAt index is declared in schema.prisma and created
-- above, so the default index create_hypertable() would add is skipped.
SELECT create_hypertable('delivery_facts', 'occurredAt', create_default_indexes => false);
