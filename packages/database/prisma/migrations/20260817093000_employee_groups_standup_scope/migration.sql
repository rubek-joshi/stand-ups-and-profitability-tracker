-- CreateEnum
CREATE TYPE "StandupScopePreference" AS ENUM ('ask', 'everyone', 'group');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_GROUP_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_GROUP_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_GROUP_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_GROUP_MEMBER_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_GROUP_MEMBER_REMOVED';

-- CreateTable
CREATE TABLE "employee_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_group_members" (
    "groupId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_group_members_pkey" PRIMARY KEY ("groupId","employeeId")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "standupScopePreference" "StandupScopePreference" NOT NULL DEFAULT 'ask';
ALTER TABLE "users" ADD COLUMN "standupPreferredGroupId" TEXT;

-- AlterTable
ALTER TABLE "standups" ADD COLUMN "employeeGroupId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "employee_groups_name_key" ON "employee_groups"("name");

-- CreateIndex
CREATE INDEX "employee_group_members_employeeId_idx" ON "employee_group_members"("employeeId");

-- CreateIndex
CREATE INDEX "users_standupPreferredGroupId_idx" ON "users"("standupPreferredGroupId");

-- CreateIndex
CREATE INDEX "standups_employeeGroupId_idx" ON "standups"("employeeGroupId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_standupPreferredGroupId_fkey" FOREIGN KEY ("standupPreferredGroupId") REFERENCES "employee_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_group_members" ADD CONSTRAINT "employee_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "employee_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_group_members" ADD CONSTRAINT "employee_group_members_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standups" ADD CONSTRAINT "standups_employeeGroupId_fkey" FOREIGN KEY ("employeeGroupId") REFERENCES "employee_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
