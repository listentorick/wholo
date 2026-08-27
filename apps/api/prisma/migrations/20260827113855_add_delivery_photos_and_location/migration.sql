-- AlterTable
ALTER TABLE "order_delivery_outcomes" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "locationAccuracyM" DOUBLE PRECISION,
ADD COLUMN     "locationCapturedAt" TIMESTAMP(3),
ADD COLUMN     "locationUnavailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "order_delivery_photos" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "outcomeId" TEXT,
    "variants" JSONB NOT NULL,
    "sourceMimeType" TEXT NOT NULL,
    "sourceSizeBytes" INTEGER NOT NULL,
    "sourceWidth" INTEGER,
    "sourceHeight" INTEGER,
    "capturedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_delivery_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_delivery_photos_orderId_idx" ON "order_delivery_photos"("orderId");

-- AddForeignKey
ALTER TABLE "order_delivery_photos" ADD CONSTRAINT "order_delivery_photos_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_delivery_photos" ADD CONSTRAINT "order_delivery_photos_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "order_delivery_outcomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
