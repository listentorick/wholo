-- CreateEnum
CREATE TYPE "PaymentTermType" AS ENUM ('ACCOUNTING_SYSTEM_DEFAULT', 'DUE_IMMEDIATELY', 'DAYS_AFTER_INVOICE', 'DAYS_AFTER_MONTH_END', 'DAY_OF_WEEK', 'DAY_OF_MONTH');

-- CreateEnum
CREATE TYPE "PaymentTermSource" AS ENUM ('DISTRIBUTOR_DEFAULT', 'TRADER_CUSTOMER_OVERRIDE');

-- AlterTable
ALTER TABLE "accounting_invoice_exports" ADD COLUMN     "requestedDueDate" DATE;

-- AlterTable
ALTER TABLE "distributor_settings" ADD COLUMN     "defaultPaymentTermId" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "dueDate" DATE,
ADD COLUMN     "invoiceDate" DATE,
ADD COLUMN     "paymentTermIdSnapshot" TEXT,
ADD COLUMN     "paymentTermSnapshot" JSONB,
ADD COLUMN     "paymentTermSourceSnapshot" "PaymentTermSource";

-- AlterTable
ALTER TABLE "trade_relationships" DROP COLUMN "paymentTerms";

-- AlterTable
ALTER TABLE "trader_customer_settings" ADD COLUMN     "paymentTermId" TEXT;

-- CreateTable
CREATE TABLE "payment_terms" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PaymentTermType" NOT NULL,
    "days" INTEGER,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "systemKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_terms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_terms_distributorId_active_idx" ON "payment_terms"("distributorId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "payment_terms_distributorId_systemKey_key" ON "payment_terms"("distributorId", "systemKey");

-- AddForeignKey
ALTER TABLE "distributor_settings" ADD CONSTRAINT "distributor_settings_defaultPaymentTermId_fkey" FOREIGN KEY ("defaultPaymentTermId") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trader_customer_settings" ADD CONSTRAINT "trader_customer_settings_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

