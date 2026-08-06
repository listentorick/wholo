-- CreateEnum
CREATE TYPE "TaxClassification" AS ENUM ('STANDARD', 'REDUCED', 'ZERO_RATED', 'EXEMPT', 'OUTSIDE_SCOPE');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "taxTypeId" TEXT;

-- CreateTable
CREATE TABLE "tax_types" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classification" "TaxClassification" NOT NULL,
    "ratePercentage" DECIMAL(5,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_types_distributorId_active_idx" ON "tax_types"("distributorId", "active");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_taxTypeId_fkey" FOREIGN KEY ("taxTypeId") REFERENCES "tax_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_types" ADD CONSTRAINT "tax_types_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
