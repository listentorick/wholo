-- CreateEnum
CREATE TYPE "SupportAccessEndedBy" AS ENUM ('HOLDER', 'DISTRIBUTOR', 'STOCDUP');

-- AlterTable
ALTER TABLE "support_access_grants" ADD COLUMN     "endedBy" "SupportAccessEndedBy";
