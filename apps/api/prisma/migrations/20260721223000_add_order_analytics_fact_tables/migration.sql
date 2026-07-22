-- CreateTable
CREATE TABLE "order_facts" (
    "eventId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "traderCustomerId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "resultingStatus" "OrderStatus" NOT NULL,
    "subtotalAmount" DECIMAL(10,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "distributorLocalDate" DATE NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_facts_pkey" PRIMARY KEY ("eventId","occurredAt")
);

-- CreateTable
CREATE TABLE "order_line_facts" (
    "eventId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "traderCustomerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "netValue" DECIMAL(10,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "distributorLocalDate" DATE NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_line_facts_pkey" PRIMARY KEY ("eventId","orderLineId","occurredAt")
);

-- CreateTable
CREATE TABLE "order_analytics_state" (
    "orderId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "traderCustomerId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "subtotalAmount" DECIMAL(10,2) NOT NULL,
    "distributorLocalDate" DATE NOT NULL,
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_analytics_state_pkey" PRIMARY KEY ("orderId")
);

-- CreateIndex
CREATE INDEX "order_facts_distributorId_distributorLocalDate_idx" ON "order_facts"("distributorId", "distributorLocalDate");

-- CreateIndex
CREATE INDEX "order_facts_orderId_idx" ON "order_facts"("orderId");

-- CreateIndex
CREATE INDEX "order_line_facts_distributorId_distributorLocalDate_idx" ON "order_line_facts"("distributorId", "distributorLocalDate");

-- CreateIndex
CREATE INDEX "order_line_facts_productId_idx" ON "order_line_facts"("productId");

-- CreateIndex
CREATE INDEX "order_analytics_state_distributorId_distributorLocalDate_st_idx" ON "order_analytics_state"("distributorId", "distributorLocalDate", "status");

-- CreateIndex
CREATE INDEX "order_analytics_state_distributorId_traderCustomerId_status_idx" ON "order_analytics_state"("distributorId", "traderCustomerId", "status");

-- ConvertToHypertable
-- order_facts / order_line_facts are append-only event logs; converting to
-- Timescale hypertables gives efficient time-range scans and chunked
-- compression/retention as history grows. Both tables' primary keys already
-- include occurredAt (the partitioning column), which Timescale requires of
-- every unique index on a hypertable.
SELECT create_hypertable('order_facts', 'occurredAt');
SELECT create_hypertable('order_line_facts', 'occurredAt');
