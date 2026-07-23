-- CreateEnum
CREATE TYPE "AccountingBulkImportRecordType" AS ENUM ('PRODUCT', 'CONTACT');

-- CreateEnum
CREATE TYPE "AccountingBulkImportJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "accounting_bulk_import_jobs" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "accountingConnectionId" TEXT NOT NULL,
    "recordType" "AccountingBulkImportRecordType" NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" "AccountingBulkImportJobStatus" NOT NULL DEFAULT 'QUEUED',
    "honourSuggestions" BOOLEAN NOT NULL DEFAULT false,
    "selection" JSONB NOT NULL,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "results" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "accounting_bulk_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_notifications" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkPath" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounting_bulk_import_jobs_distributorId_createdAt_idx" ON "accounting_bulk_import_jobs"("distributorId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_notifications_userId_createdAt_idx" ON "admin_notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_notifications_userId_readAt_idx" ON "admin_notifications"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "accounting_bulk_import_jobs" ADD CONSTRAINT "accounting_bulk_import_jobs_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_bulk_import_jobs" ADD CONSTRAINT "accounting_bulk_import_jobs_accountingConnectionId_fkey" FOREIGN KEY ("accountingConnectionId") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
