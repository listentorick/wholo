-- CreateEnum
CREATE TYPE "RelationshipOrigin" AS ENUM ('MANUAL', 'ACCOUNTING_IMPORT', 'ACCESS_REQUEST', 'UNKNOWN');

-- CreateTable
CREATE TABLE "relationship_facts" (
    "eventId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" "TradeRelationshipStatus",
    "toStatus" "TradeRelationshipStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "distributorLocalDate" DATE NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relationship_facts_pkey" PRIMARY KEY ("eventId","occurredAt")
);

-- CreateTable
CREATE TABLE "relationship_analytics_state" (
    "relationshipId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "origin" "RelationshipOrigin" NOT NULL,
    "openedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "activatedVia" TEXT,
    "status" "TradeRelationshipStatus" NOT NULL,
    "removedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relationship_analytics_state_pkey" PRIMARY KEY ("relationshipId")
);

-- CreateIndex
CREATE INDEX "relationship_facts_distributorId_distributorLocalDate_idx" ON "relationship_facts"("distributorId", "distributorLocalDate");

-- CreateIndex
CREATE INDEX "relationship_facts_relationshipId_idx" ON "relationship_facts"("relationshipId");

-- CreateIndex
CREATE INDEX "relationship_facts_occurredAt_idx" ON "relationship_facts"("occurredAt");

-- CreateIndex
CREATE INDEX "relationship_analytics_state_distributorId_activatedAt_idx" ON "relationship_analytics_state"("distributorId", "activatedAt");

-- CreateIndex
CREATE INDEX "relationship_analytics_state_distributorId_status_idx" ON "relationship_analytics_state"("distributorId", "status");

-- Timescale hypertable (ADR-052 sanctioned exception). The primary key already
-- includes occurredAt and @@index([occurredAt]) is declared in schema.prisma,
-- so the default index create_hypertable() would add is skipped.
SELECT create_hypertable('relationship_facts', 'occurredAt', create_default_indexes => false);
