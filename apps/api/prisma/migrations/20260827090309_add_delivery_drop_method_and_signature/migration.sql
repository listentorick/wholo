-- CreateEnum
CREATE TYPE "DeliveryDropMethod" AS ENUM ('HANDED_TO_PERSON', 'LEFT_IN_SAFE_LOCATION');

-- AlterTable
ALTER TABLE "order_delivery_outcomes" ADD COLUMN     "capturedAt" TIMESTAMP(3),
ADD COLUMN     "dropMethod" "DeliveryDropMethod",
ADD COLUMN     "signature" JSONB;
