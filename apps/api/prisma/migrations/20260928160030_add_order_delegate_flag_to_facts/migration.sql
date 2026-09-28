-- AlterTable
ALTER TABLE "order_analytics_state" ADD COLUMN     "isOrderedByDelegate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "order_facts" ADD COLUMN     "isOrderedByDelegate" BOOLEAN NOT NULL DEFAULT false;
