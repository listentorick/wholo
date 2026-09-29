-- CreateEnum
CREATE TYPE "InvoicePaymentStatus" AS ENUM ('NOT_SYNCED', 'UNPAID', 'PART_PAID', 'PAID', 'VOID');

-- CreateTable
CREATE TABLE "invoice_facts" (
    "eventId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "exportId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fromStatus" "InvoicePaymentStatus" NOT NULL,
    "toStatus" "InvoicePaymentStatus" NOT NULL,
    "currency" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "issueDate" DATE,
    "dueDate" DATE,
    "fullyPaidOn" DATE,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "distributorLocalDate" DATE NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_facts_pkey" PRIMARY KEY ("eventId","occurredAt")
);

-- CreateTable
CREATE TABLE "invoice_analytics_state" (
    "exportId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "InvoicePaymentStatus" NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "issueDate" DATE,
    "dueDate" DATE,
    "fullyPaidOn" DATE,
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_analytics_state_pkey" PRIMARY KEY ("exportId")
);

-- CreateIndex
CREATE INDEX "invoice_facts_distributorId_distributorLocalDate_idx" ON "invoice_facts"("distributorId", "distributorLocalDate");

-- CreateIndex
CREATE INDEX "invoice_facts_exportId_idx" ON "invoice_facts"("exportId");

-- CreateIndex
CREATE INDEX "invoice_facts_occurredAt_idx" ON "invoice_facts"("occurredAt");

-- CreateIndex
CREATE INDEX "invoice_analytics_state_distributorId_customerId_idx" ON "invoice_analytics_state"("distributorId", "customerId");

-- CreateIndex
CREATE INDEX "invoice_analytics_state_distributorId_fullyPaidOn_idx" ON "invoice_analytics_state"("distributorId", "fullyPaidOn");


-- Timescale hypertable (ADR-052 sanctioned exception). The primary key already
-- includes occurredAt and @@index([occurredAt]) is declared in schema.prisma,
-- so the default index create_hypertable() would add is skipped.
SELECT create_hypertable('invoice_facts', 'occurredAt', create_default_indexes => false);
