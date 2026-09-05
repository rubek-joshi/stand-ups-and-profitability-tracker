-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'WRITE_OFF_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'WRITE_OFF_DELETED';

-- AlterTable: add nullable clientId/amcId first for backfill
ALTER TABLE "invoices" ADD COLUMN "clientId" TEXT;
ALTER TABLE "invoices" ADD COLUMN "amcId" TEXT;

-- Backfill clientId from project
UPDATE "invoices" AS i
SET "clientId" = p."clientId"
FROM "projects" AS p
WHERE i."projectId" = p."id";

-- Make clientId required
ALTER TABLE "invoices" ALTER COLUMN "clientId" SET NOT NULL;

-- CreateTable
CREATE TABLE "write_off_records" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "amcId" TEXT,
    "date" DATE NOT NULL,
    "amountPaisa" BIGINT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "write_off_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoices_clientId_idx" ON "invoices"("clientId");
CREATE INDEX "invoices_amcId_idx" ON "invoices"("amcId");
CREATE INDEX "write_off_records_projectId_idx" ON "write_off_records"("projectId");
CREATE INDEX "write_off_records_amcId_idx" ON "write_off_records"("amcId");
CREATE INDEX "write_off_records_date_idx" ON "write_off_records"("date");

-- AddForeignKey
ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "clients"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_amcId_fkey"
FOREIGN KEY ("amcId") REFERENCES "amc_records"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "write_off_records"
ADD CONSTRAINT "write_off_records_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "write_off_records"
ADD CONSTRAINT "write_off_records_amcId_fkey"
FOREIGN KEY ("amcId") REFERENCES "amc_records"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "write_off_records"
ADD CONSTRAINT "write_off_records_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
