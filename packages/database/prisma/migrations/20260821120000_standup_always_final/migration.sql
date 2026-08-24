-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'STANDUP_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'STANDUP_AUTO_ABSENTED';

-- Add updatedById (backfill from createdById), drop status
ALTER TABLE "standups" ADD COLUMN "updatedById" TEXT;

UPDATE "standups" SET "updatedById" = "createdById" WHERE "updatedById" IS NULL;

ALTER TABLE "standups" ALTER COLUMN "updatedById" SET NOT NULL;

ALTER TABLE "standups" DROP COLUMN "status";

DROP TYPE "StandupStatus";

CREATE INDEX "standups_updatedById_idx" ON "standups"("updatedById");

ALTER TABLE "standups" ADD CONSTRAINT "standups_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
