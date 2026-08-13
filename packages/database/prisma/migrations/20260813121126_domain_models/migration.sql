-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'extended', 'closed', 'under_amc');

-- CreateEnum
CREATE TYPE "PersonStatus" AS ENUM ('active', 'left');

-- CreateEnum
CREATE TYPE "AttendanceType" AS ENUM ('first_half_leave', 'second_half_leave', 'late', 'paid_absence', 'unpaid_absence');

-- CreateEnum
CREATE TYPE "StandupStatus" AS ENUM ('draft', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'first_half_leave', 'second_half_leave', 'late', 'absent');

-- CreateEnum
CREATE TYPE "AmcStatus" AS ENUM ('free_period', 'reminder_due', 'paid_pending', 'overdue', 'cancelled');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CLIENT_CREATED', 'CLIENT_UPDATED', 'CLIENT_DEACTIVATED', 'CLIENT_DELETED', 'CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_DEACTIVATED', 'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_CLOSED', 'PROJECT_EXTENDED', 'PROJECT_AUTO_EXTENDED', 'PROJECT_ASSIGNMENT_CREATED', 'PROJECT_ASSIGNMENT_ENDED', 'CORE_MEMBER_ASSIGNED', 'CORE_MEMBER_UNASSIGNED', 'EMPLOYEE_CREATED', 'EMPLOYEE_UPDATED', 'EMPLOYEE_MARKED_LEFT', 'EMPLOYEE_DELETED', 'EMPLOYEE_SALARY_CREATED', 'EMPLOYEE_SALARY_UPDATED', 'EMPLOYEE_SALARY_DELETED', 'CORE_MEMBER_CREATED', 'CORE_MEMBER_UPDATED', 'CORE_MEMBER_MARKED_LEFT', 'CORE_MEMBER_DELETED', 'CORE_MEMBER_SALARY_CREATED', 'CORE_MEMBER_SALARY_UPDATED', 'CORE_MEMBER_SALARY_DELETED', 'STANDUP_CREATED', 'STANDUP_UPDATED', 'STANDUP_COMPLETED', 'STANDUP_REOPENED', 'STANDUP_OVERRIDE_GRANTED', 'AMC_SET', 'AMC_UPDATED', 'AMC_CANCELLED', 'VAT_CLEARED', 'SETTINGS_UPDATED', 'DB_SNAPSHOT_DOWNLOADED', 'USER_LOGIN');

-- CreateTable
CREATE TABLE "org_settings" (
    "id" TEXT NOT NULL,
    "vatRatePercent" INTEGER NOT NULL DEFAULT 13,
    "paidLeaveDaysPerMonth" INTEGER NOT NULL DEFAULT 4,
    "amcReminderLeadDays" INTEGER NOT NULL DEFAULT 7,
    "healthHealthyMinPercent" INTEGER NOT NULL DEFAULT 20,
    "healthAtRiskMinPercent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactInfo" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSeeded" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "budgetPaisa" BIGINT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "isVatApplicable" BOOLEAN NOT NULL DEFAULT true,
    "vatRateApplied" INTEGER NOT NULL DEFAULT 13,
    "autoExtended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_assignments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),

    CONSTRAINT "project_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_member_assignments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "coreMemberId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),

    CONSTRAINT "core_member_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_extensions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amountPaisa" BIGINT NOT NULL DEFAULT 0,
    "isProfit" BOOLEAN NOT NULL DEFAULT false,
    "isAuto" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "PersonStatus" NOT NULL DEFAULT 'active',
    "dateJoined" DATE NOT NULL,
    "dateLeft" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_salary_entries" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "salaryPaisa" BIGINT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_salary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_members" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "PersonStatus" NOT NULL DEFAULT 'active',
    "dateJoined" DATE NOT NULL,
    "dateLeft" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "core_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_member_salary_entries" (
    "id" TEXT NOT NULL,
    "coreMemberId" TEXT NOT NULL,
    "salaryPaisa" BIGINT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "core_member_salary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standups" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "StandupStatus" NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "yjsState" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "standups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standup_entries" (
    "id" TEXT NOT NULL,
    "standupId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceStatus" "AttendanceStatus" NOT NULL DEFAULT 'present',
    "notesMarkdown" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "standup_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_allocations" (
    "id" TEXT NOT NULL,
    "standupEntryId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "percentage" INTEGER NOT NULL,
    "isNonBillable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "project_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standup_project_overrides" (
    "id" TEXT NOT NULL,
    "standupId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "standup_project_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "standupId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "month" TEXT NOT NULL,
    "type" "AttendanceType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amc_records" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "setDate" DATE NOT NULL,
    "freeUntilDate" DATE NOT NULL,
    "reminderSentAt" TIMESTAMP(3),
    "status" "AmcStatus" NOT NULL DEFAULT 'free_period',
    "cancelledAt" TIMESTAMP(3),
    "cancelledRemark" TEXT,
    "amcAmountPaisa" BIGINT,
    "isVatApplicable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amc_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vat_clearances" (
    "id" TEXT NOT NULL,
    "amountPaisa" BIGINT NOT NULL,
    "clearedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vat_clearances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "AuditAction" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "db_snapshots" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "db_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "projects_clientId_idx" ON "projects"("clientId");

-- CreateIndex
CREATE INDEX "projects_categoryId_idx" ON "projects"("categoryId");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "project_assignments_projectId_idx" ON "project_assignments"("projectId");

-- CreateIndex
CREATE INDEX "project_assignments_employeeId_idx" ON "project_assignments"("employeeId");

-- CreateIndex
CREATE INDEX "core_member_assignments_projectId_idx" ON "core_member_assignments"("projectId");

-- CreateIndex
CREATE INDEX "core_member_assignments_coreMemberId_idx" ON "core_member_assignments"("coreMemberId");

-- CreateIndex
CREATE INDEX "project_extensions_projectId_idx" ON "project_extensions"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE INDEX "employee_salary_entries_employeeId_effectiveDate_idx" ON "employee_salary_entries"("employeeId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "core_members_email_key" ON "core_members"("email");

-- CreateIndex
CREATE INDEX "core_member_salary_entries_coreMemberId_effectiveDate_idx" ON "core_member_salary_entries"("coreMemberId", "effectiveDate");

-- CreateIndex
CREATE INDEX "standups_date_idx" ON "standups"("date");

-- CreateIndex
CREATE UNIQUE INDEX "standup_entries_standupId_employeeId_key" ON "standup_entries"("standupId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "project_allocations_standupEntryId_projectId_key" ON "project_allocations"("standupEntryId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "standup_project_overrides_standupId_projectId_key" ON "standup_project_overrides"("standupId", "projectId");

-- CreateIndex
CREATE INDEX "attendance_records_employeeId_month_idx" ON "attendance_records"("employeeId", "month");

-- CreateIndex
CREATE INDEX "attendance_records_standupId_idx" ON "attendance_records"("standupId");

-- CreateIndex
CREATE UNIQUE INDEX "amc_records_projectId_key" ON "amc_records"("projectId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_member_assignments" ADD CONSTRAINT "core_member_assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_member_assignments" ADD CONSTRAINT "core_member_assignments_coreMemberId_fkey" FOREIGN KEY ("coreMemberId") REFERENCES "core_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_extensions" ADD CONSTRAINT "project_extensions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_extensions" ADD CONSTRAINT "project_extensions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salary_entries" ADD CONSTRAINT "employee_salary_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salary_entries" ADD CONSTRAINT "employee_salary_entries_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_member_salary_entries" ADD CONSTRAINT "core_member_salary_entries_coreMemberId_fkey" FOREIGN KEY ("coreMemberId") REFERENCES "core_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_member_salary_entries" ADD CONSTRAINT "core_member_salary_entries_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standups" ADD CONSTRAINT "standups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standup_entries" ADD CONSTRAINT "standup_entries_standupId_fkey" FOREIGN KEY ("standupId") REFERENCES "standups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standup_entries" ADD CONSTRAINT "standup_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_standupEntryId_fkey" FOREIGN KEY ("standupEntryId") REFERENCES "standup_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standup_project_overrides" ADD CONSTRAINT "standup_project_overrides_standupId_fkey" FOREIGN KEY ("standupId") REFERENCES "standups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standup_project_overrides" ADD CONSTRAINT "standup_project_overrides_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standup_project_overrides" ADD CONSTRAINT "standup_project_overrides_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_standupId_fkey" FOREIGN KEY ("standupId") REFERENCES "standups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amc_records" ADD CONSTRAINT "amc_records_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vat_clearances" ADD CONSTRAINT "vat_clearances_clearedById_fkey" FOREIGN KEY ("clearedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "db_snapshots" ADD CONSTRAINT "db_snapshots_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
