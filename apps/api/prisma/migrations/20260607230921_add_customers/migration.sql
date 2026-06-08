-- CreateEnum
CREATE TYPE "TradeRelationshipStatus" AS ENUM ('PENDING_INVITE', 'PENDING_REQUEST', 'ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "organisations" ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "trade_relationships" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "TradeRelationshipStatus" NOT NULL DEFAULT 'PENDING_INVITE',
    "accountNumber" TEXT,
    "creditLimit" DECIMAL(10,2),
    "paymentTerms" TEXT,
    "notes" TEXT,
    "deliveryLine1" TEXT,
    "deliveryLine2" TEXT,
    "deliveryCity" TEXT,
    "deliveryState" TEXT,
    "deliveryPostcode" TEXT,
    "deliveryCountry" TEXT,
    "billingLine1" TEXT,
    "billingLine2" TEXT,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingPostcode" TEXT,
    "billingCountry" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_invitations" (
    "id" TEXT NOT NULL,
    "tradeRelationshipId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trade_relationships_distributorId_createdAt_idx" ON "trade_relationships"("distributorId", "createdAt");

-- CreateIndex
CREATE INDEX "trade_relationships_distributorId_status_idx" ON "trade_relationships"("distributorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "trade_relationships_distributorId_customerId_key" ON "trade_relationships"("distributorId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_invitations_token_key" ON "customer_invitations"("token");

-- CreateIndex
CREATE INDEX "customer_invitations_token_idx" ON "customer_invitations"("token");

-- CreateIndex
CREATE INDEX "customer_invitations_distributorId_idx" ON "customer_invitations"("distributorId");

-- AddForeignKey
ALTER TABLE "trade_relationships" ADD CONSTRAINT "trade_relationships_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_relationships" ADD CONSTRAINT "trade_relationships_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invitations" ADD CONSTRAINT "customer_invitations_tradeRelationshipId_fkey" FOREIGN KEY ("tradeRelationshipId") REFERENCES "trade_relationships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invitations" ADD CONSTRAINT "customer_invitations_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
