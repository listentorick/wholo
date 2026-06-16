-- AlterTable
ALTER TABLE "distributor_settings" ADD COLUMN     "marketplaceDescription" TEXT,
ADD COLUMN     "marketplaceVisible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "orderNotificationEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];
