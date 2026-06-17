-- AlterTable
ALTER TABLE "distributor_settings" ADD COLUMN     "processingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[];

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "requestedDeliveryDate" DATE;

-- AlterTable
ALTER TABLE "trader_customer_settings" ADD COLUMN     "deliveryProfileId" TEXT;

-- CreateTable
CREATE TABLE "delivery_profiles" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "defaultWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "defaultCutoffTime" TEXT NOT NULL DEFAULT '17:00',
    "defaultCutoffProcessingDays" INTEGER NOT NULL DEFAULT 1,
    "speciallyEnabledDates" DATE[],
    "speciallyDisabledDates" DATE[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_profile_cutoff_rules" (
    "id" TEXT NOT NULL,
    "deliveryProfileId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "cutoffTime" TEXT NOT NULL,
    "processingDaysBeforeDelivery" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_profile_cutoff_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_profiles_distributorId_active_idx" ON "delivery_profiles"("distributorId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_profile_cutoff_rules_deliveryProfileId_weekday_key" ON "delivery_profile_cutoff_rules"("deliveryProfileId", "weekday");

-- AddForeignKey
ALTER TABLE "trader_customer_settings" ADD CONSTRAINT "trader_customer_settings_deliveryProfileId_fkey" FOREIGN KEY ("deliveryProfileId") REFERENCES "delivery_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_profiles" ADD CONSTRAINT "delivery_profiles_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_profile_cutoff_rules" ADD CONSTRAINT "delivery_profile_cutoff_rules_deliveryProfileId_fkey" FOREIGN KEY ("deliveryProfileId") REFERENCES "delivery_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
