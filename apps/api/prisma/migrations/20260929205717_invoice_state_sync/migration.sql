-- CreateEnum
CREATE TYPE "AccountingInvoiceState" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'AWAITING_PAYMENT', 'PAID', 'VOIDED', 'DELETED');

-- AlterTable
ALTER TABLE "accounting_invoice_exports" ADD COLUMN     "amountCredited" DECIMAL(12,2),
ADD COLUMN     "amountDue" DECIMAL(12,2),
ADD COLUMN     "amountPaid" DECIMAL(12,2),
ADD COLUMN     "dueDate" DATE,
ADD COLUMN     "fullyPaidOn" DATE,
ADD COLUMN     "invoiceState" "AccountingInvoiceState",
ADD COLUMN     "invoiceTotal" DECIMAL(12,2),
ADD COLUMN     "issueDate" DATE,
ADD COLUMN     "providerUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "stateSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "accounting_invoice_exports_distributorId_invoiceState_idx" ON "accounting_invoice_exports"("distributorId", "invoiceState");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_invoice_exports_accountingConnectionId_externalI_key" ON "accounting_invoice_exports"("accountingConnectionId", "externalInvoiceId");

