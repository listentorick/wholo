-- CreateTable
CREATE TABLE "catalogues" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogue_products" (
    "catalogueId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalogue_products_pkey" PRIMARY KEY ("catalogueId","productId")
);

-- CreateTable
CREATE TABLE "customer_catalogues" (
    "tradeRelationshipId" TEXT NOT NULL,
    "catalogueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_catalogues_pkey" PRIMARY KEY ("tradeRelationshipId","catalogueId")
);

-- CreateIndex
CREATE INDEX "catalogues_distributorId_idx" ON "catalogues"("distributorId");

-- AddForeignKey
ALTER TABLE "catalogues" ADD CONSTRAINT "catalogues_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_products" ADD CONSTRAINT "catalogue_products_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "catalogues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_products" ADD CONSTRAINT "catalogue_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_catalogues" ADD CONSTRAINT "customer_catalogues_tradeRelationshipId_fkey" FOREIGN KEY ("tradeRelationshipId") REFERENCES "trade_relationships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_catalogues" ADD CONSTRAINT "customer_catalogues_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "catalogues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
