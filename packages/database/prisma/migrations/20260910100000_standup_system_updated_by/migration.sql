-- AlterTable: allow null updatedBy for system-authored stand-up writes (auto-absent)
ALTER TABLE "standups" ALTER COLUMN "updatedById" DROP NOT NULL;

-- Drop no-op auto-absent audits (ran but marked nobody)
DELETE FROM "audit_logs"
WHERE "action" = 'STANDUP_AUTO_ABSENTED'
  AND COALESCE(("metadata"->>'markedAbsent')::int, 0) = 0;

-- Prior auto-absent audits that marked people should show actor System
UPDATE "audit_logs"
SET "actorId" = NULL
WHERE "action" = 'STANDUP_AUTO_ABSENTED'
  AND COALESCE(("metadata"->>'markedAbsent')::int, 0) > 0;

-- Stand-ups whose latest stand-up audit is a real auto-absent → System updater
UPDATE "standups" AS s
SET "updatedById" = NULL
FROM (
  SELECT DISTINCT ON ("targetId")
    "targetId",
    "action",
    "metadata"
  FROM "audit_logs"
  WHERE "targetType" = 'Standup'
  ORDER BY "targetId", "createdAt" DESC
) AS latest
WHERE s."id" = latest."targetId"
  AND latest."action" = 'STANDUP_AUTO_ABSENTED'
  AND COALESCE((latest."metadata"->>'markedAbsent')::int, 0) > 0;
