-- CreateTable
CREATE TABLE "asset_images" (
    "id" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "variants" JSONB NOT NULL,
    "sourceFilename" TEXT,
    "sourceMimeType" TEXT NOT NULL,
    "sourceSizeBytes" INTEGER NOT NULL,
    "sourceWidth" INTEGER,
    "sourceHeight" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_images_assetType_entityId_sortOrder_idx" ON "asset_images"("assetType", "entityId", "sortOrder");

-- CreateIndex
CREATE INDEX "asset_images_distributorId_idx" ON "asset_images"("distributorId");
