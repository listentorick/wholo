-- AlterTable
ALTER TABLE "ingestion_runs" ADD COLUMN     "cursor" TEXT,
ADD COLUMN     "lastFullRunAt" TIMESTAMP(3),
ADD COLUMN     "nextRunAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ingestion_runs_sourceType_nextRunAt_idx" ON "ingestion_runs"("sourceType", "nextRunAt");
