-- CreateEnum
CREATE TYPE "AmcType" AS ENUM ('complimentary', 'paid');

-- CreateEnum
CREATE TYPE "AmcRenewalDecision" AS ENUM ('pending', 'renewed', 'declined');

-- DropForeignKey
ALTER TABLE "amc_records" DROP CONSTRAINT IF EXISTS "amc_records_projectId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "amc_records_projectId_key";

-- AlterTable: rename date columns and add new fields
ALTER TABLE "amc_records" RENAME COLUMN "setDate" TO "startDate";
ALTER TABLE "amc_records" RENAME COLUMN "freeUntilDate" TO "endDate";

ALTER TABLE "amc_records"
  ADD COLUMN "type" "AmcType" NOT NULL DEFAULT 'complimentary',
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "renewalDecision" "AmcRenewalDecision";

-- Recreate FK (non-unique)
ALTER TABLE "amc_records" ADD CONSTRAINT "amc_records_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "amc_records_projectId_idx" ON "amc_records"("projectId");
CREATE INDEX "amc_records_status_idx" ON "amc_records"("status");
CREATE INDEX "amc_records_endDate_idx" ON "amc_records"("endDate");