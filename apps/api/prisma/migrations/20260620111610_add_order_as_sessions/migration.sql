-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delegateAdminUserId" TEXT,
ADD COLUMN     "isOrderedByDelegate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "order_as_sessions" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_as_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_as_delivery_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "order_as_delivery_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_as_sessions_adminUserId_customerId_distributorId_key" ON "order_as_sessions"("adminUserId", "customerId", "distributorId");

-- CreateIndex
CREATE UNIQUE INDEX "order_as_delivery_tokens_tokenHash_key" ON "order_as_delivery_tokens"("tokenHash");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delegateAdminUserId_fkey" FOREIGN KEY ("delegateAdminUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_as_sessions" ADD CONSTRAINT "order_as_sessions_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_as_sessions" ADD CONSTRAINT "order_as_sessions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_as_sessions" ADD CONSTRAINT "order_as_sessions_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_as_delivery_tokens" ADD CONSTRAINT "order_as_delivery_tokens_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "order_as_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
