-- CreateEnum
CREATE TYPE "IngestionRunStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "IngestionRunTrigger" AS ENUM ('MANUAL', 'SCHEDULED');

-- CreateTable
CREATE TABLE "ingestion_runs" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "status" "IngestionRunStatus" NOT NULL DEFAULT 'QUEUED',
    "trigger" "IngestionRunTrigger" NOT NULL,
    "recordsTotal" INTEGER,
    "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "recordsFailed" INTEGER NOT NULL DEFAULT 0,
    "detailCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingestion_runs_distributorId_idx" ON "ingestion_runs"("distributorId");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_runs_sourceType_sourceRef_resourceType_key" ON "ingestion_runs"("sourceType", "sourceRef", "resourceType");

-- AddForeignKey
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
