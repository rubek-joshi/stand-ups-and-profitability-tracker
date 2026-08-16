-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'USER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_DEACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_REACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_PASSWORD_CHANGED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
