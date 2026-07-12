-- CreateEnum
CREATE TYPE "AccountingInvoiceExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AccountingInvoiceTargetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'AUTHORISED');

-- AlterTable
ALTER TABLE "accounting_connections" ADD COLUMN     "invoiceExportTargetStatus" "AccountingInvoiceTargetStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "accounting_invoice_exports" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "accountingConnectionId" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "AccountingInvoiceExportStatus" NOT NULL DEFAULT 'PENDING',
    "externalInvoiceId" TEXT,
    "externalInvoiceNumber" TEXT,
    "externalInvoiceStatus" TEXT,
    "exportedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_invoice_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounting_invoice_exports_distributorId_status_idx" ON "accounting_invoice_exports"("distributorId", "status");

-- CreateIndex
CREATE INDEX "accounting_invoice_exports_orderId_idx" ON "accounting_invoice_exports"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_invoice_exports_accountingConnectionId_orderId_key" ON "accounting_invoice_exports"("accountingConnectionId", "orderId");

-- AddForeignKey
ALTER TABLE "accounting_invoice_exports" ADD CONSTRAINT "accounting_invoice_exports_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_invoice_exports" ADD CONSTRAINT "accounting_invoice_exports_accountingConnectionId_fkey" FOREIGN KEY ("accountingConnectionId") REFERENCES "accounting_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_invoice_exports" ADD CONSTRAINT "accounting_invoice_exports_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
