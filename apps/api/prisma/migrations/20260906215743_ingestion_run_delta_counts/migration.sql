-- AlterTable
ALTER TABLE "ingestion_runs" ADD COLUMN     "recordsCreated" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "recordsRemoved" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "recordsUpdated" INTEGER NOT NULL DEFAULT 0;
