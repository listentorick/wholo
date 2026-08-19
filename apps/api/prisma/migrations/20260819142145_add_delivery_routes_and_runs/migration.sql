-- CreateEnum
CREATE TYPE "DeliveryRunStatus" AS ENUM ('OPEN', 'READY');

-- CreateEnum
CREATE TYPE "DeliveryRunSource" AS ENUM ('STOCDUP');

-- CreateEnum
CREATE TYPE "DeliveryAllocationSource" AS ENUM ('DEFAULT_ROUTE', 'MANUAL', 'EXTERNAL_PROVIDER');

-- CreateEnum
CREATE TYPE "DeliveryRunOrderStatus" AS ENUM ('PLANNED');

-- AlterTable
ALTER TABLE "distributor_settings" ADD COLUMN     "nearbyDeliveryWindowDays" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "scheduledDeliveryDate" DATE;

-- CreateTable
CREATE TABLE "delivery_routes" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "defaultDriverName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_route_customers" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "defaultDropPosition" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedByUserId" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "removedByUserId" TEXT,
    "activeDistributorCustomerId" TEXT,

    CONSTRAINT "delivery_route_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_runs" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "routeId" TEXT,
    "deliveryDate" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "driverName" TEXT,
    "vehicleId" TEXT,
    "vehicleName" TEXT,
    "status" "DeliveryRunStatus" NOT NULL DEFAULT 'OPEN',
    "source" "DeliveryRunSource" NOT NULL DEFAULT 'STOCDUP',
    "externalProvider" TEXT,
    "externalId" TEXT,
    "optimised" BOOLEAN NOT NULL DEFAULT false,
    "readyAt" TIMESTAMP(3),
    "readyByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_run_order" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliverySequence" INTEGER,
    "relativeSequence" INTEGER,
    "allocationSource" "DeliveryAllocationSource" NOT NULL,
    "deliveryStatus" "DeliveryRunOrderStatus" NOT NULL DEFAULT 'PLANNED',
    "providerStatus" TEXT,
    "plannedAt" TIMESTAMP(3),
    "etaAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "signedBy" TEXT,
    "providerData" JSONB,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedByUserId" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "removedByUserId" TEXT,
    "activeOrderId" TEXT,

    CONSTRAINT "delivery_run_order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_routes_distributorId_active_idx" ON "delivery_routes"("distributorId", "active");

-- CreateIndex
CREATE INDEX "delivery_route_customers_routeId_defaultDropPosition_idx" ON "delivery_route_customers"("routeId", "defaultDropPosition");

-- CreateIndex
CREATE INDEX "delivery_route_customers_customerId_idx" ON "delivery_route_customers"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_route_customers_activeDistributorCustomerId_key" ON "delivery_route_customers"("activeDistributorCustomerId");

-- CreateIndex
CREATE INDEX "delivery_runs_distributorId_deliveryDate_status_idx" ON "delivery_runs"("distributorId", "deliveryDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_runs_distributorId_routeId_deliveryDate_key" ON "delivery_runs"("distributorId", "routeId", "deliveryDate");

-- CreateIndex
CREATE INDEX "delivery_run_order_runId_deliverySequence_idx" ON "delivery_run_order"("runId", "deliverySequence");

-- CreateIndex
CREATE INDEX "delivery_run_order_orderId_idx" ON "delivery_run_order"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_run_order_activeOrderId_key" ON "delivery_run_order"("activeOrderId");

-- AddForeignKey
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_route_customers" ADD CONSTRAINT "delivery_route_customers_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "delivery_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_route_customers" ADD CONSTRAINT "delivery_route_customers_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_runs" ADD CONSTRAINT "delivery_runs_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_runs" ADD CONSTRAINT "delivery_runs_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "delivery_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_run_order" ADD CONSTRAINT "delivery_run_order_runId_fkey" FOREIGN KEY ("runId") REFERENCES "delivery_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_run_order" ADD CONSTRAINT "delivery_run_order_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written, not schema.prisma-diffed: Prisma has no trigger support in
-- any form (see ADR-052 and the add_active_marker_triggers migration this
-- follows). Each trigger makes its table's "active" marker column fully
-- self-maintaining at the database level, independent of application code —
-- a raw insert that forgets to set the marker column would otherwise
-- silently violate the "one active row" rule with no error.

-- delivery_route_customers: activeDistributorCustomerId mirrors
-- "<distributorId>:<customerId>" (looked up via the route, since this table
-- has no distributorId column of its own) only while removedAt is null —
-- enforces "a customer has at most one active default route per
-- distributor" (the PBI's own stated rule is per-distributor, not per-route).
CREATE OR REPLACE FUNCTION set_delivery_route_customer_marker() RETURNS TRIGGER AS $$
DECLARE
  route_distributor_id TEXT;
BEGIN
  IF NEW."removedAt" IS NULL THEN
    SELECT "distributorId" INTO route_distributor_id FROM "delivery_routes" WHERE "id" = NEW."routeId";
    NEW."activeDistributorCustomerId" := route_distributor_id || ':' || NEW."customerId";
  ELSE
    NEW."activeDistributorCustomerId" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER delivery_route_customers_set_marker
BEFORE INSERT OR UPDATE ON "delivery_route_customers"
FOR EACH ROW EXECUTE FUNCTION set_delivery_route_customer_marker();

-- delivery_run_order: activeOrderId mirrors orderId only while removedAt is
-- null — enforces "an order has at most one active run allocation" globally.
CREATE OR REPLACE FUNCTION set_delivery_run_order_marker() RETURNS TRIGGER AS $$
BEGIN
  NEW."activeOrderId" := CASE WHEN NEW."removedAt" IS NULL THEN NEW."orderId" ELSE NULL END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER delivery_run_order_set_marker
BEFORE INSERT OR UPDATE ON "delivery_run_order"
FOR EACH ROW EXECUTE FUNCTION set_delivery_run_order_marker();
