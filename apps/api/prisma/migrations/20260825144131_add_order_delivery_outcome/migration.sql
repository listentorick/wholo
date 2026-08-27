-- CreateEnum
CREATE TYPE "DeliveryOutcomeType" AS ENUM ('DELIVERED', 'UNABLE_TO_DELIVER');

-- CreateEnum
CREATE TYPE "UnableToDeliverReason" AS ENUM ('CUSTOMER_CLOSED', 'CUSTOMER_REFUSED', 'UNABLE_TO_ACCESS_PREMISES', 'INCORRECT_ADDRESS', 'OTHER');

-- CreateTable
CREATE TABLE "order_delivery_outcomes" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "outcome" "DeliveryOutcomeType" NOT NULL,
    "recipientName" TEXT,
    "notes" TEXT,
    "unableReason" "UnableToDeliverReason",
    "unableReasonNote" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedViaQrToken" BOOLEAN NOT NULL DEFAULT true,
    "correctedAt" TIMESTAMP(3),
    "correctedByUserId" TEXT,

    CONSTRAINT "order_delivery_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_delivery_outcomes_orderId_key" ON "order_delivery_outcomes"("orderId");

-- AddForeignKey
ALTER TABLE "order_delivery_outcomes" ADD CONSTRAINT "order_delivery_outcomes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
