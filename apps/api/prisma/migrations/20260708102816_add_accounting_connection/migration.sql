-- CreateEnum
CREATE TYPE "AccountingProvider" AS ENUM ('XERO');

-- CreateEnum
CREATE TYPE "AccountingConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR', 'REVOKED');

-- CreateTable
CREATE TABLE "accounting_connections" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL,
    "status" "AccountingConnectionStatus" NOT NULL,
    "externalOrganisationId" TEXT NOT NULL,
    "externalOrganisationName" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "encryptedCredentialData" TEXT NOT NULL,
    "connectedByUserId" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL,
    "disconnectedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_oauth_states" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL,
    "distributorId" TEXT NOT NULL,
    "connectedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounting_connections_distributorId_idx" ON "accounting_connections"("distributorId");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_oauth_states_state_key" ON "accounting_oauth_states"("state");

-- AddForeignKey
ALTER TABLE "accounting_connections" ADD CONSTRAINT "accounting_connections_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
-- One active (CONNECTED) accounting connection per distributor.
-- Hand-added: Prisma's schema DSL cannot express a partial unique index.
CREATE UNIQUE INDEX "unique_active_accounting_connection"
ON "accounting_connections"("distributorId")
WHERE "status" = 'CONNECTED';
