-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateTable
CREATE TABLE "product_search_documents" (
    "productId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "searchTextNormalised" TEXT NOT NULL,
    "nameNormalised" TEXT NOT NULL,
    "skuNormalised" TEXT,
    "searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('english', "searchText")) STORED,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_search_documents_pkey" PRIMARY KEY ("productId")
);

-- CreateIndex
CREATE INDEX "product_search_documents_distributorId_idx" ON "product_search_documents"("distributorId");

-- CreateIndex
CREATE INDEX "product_search_documents_searchVector_idx" ON "product_search_documents" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "product_search_documents_searchTextNormalised_idx" ON "product_search_documents" USING GIN ("searchTextNormalised" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "product_search_documents_nameNormalised_idx" ON "product_search_documents" USING GIN ("nameNormalised" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "product_search_documents_skuNormalised_idx" ON "product_search_documents" USING GIN ("skuNormalised" gin_trgm_ops);

-- AddForeignKey
ALTER TABLE "product_search_documents" ADD CONSTRAINT "product_search_documents_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
