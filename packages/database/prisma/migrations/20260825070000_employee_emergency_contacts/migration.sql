ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_EMERGENCY_CONTACT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_EMERGENCY_CONTACT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'EMPLOYEE_EMERGENCY_CONTACT_DELETED';

CREATE TABLE "employee_emergency_contacts" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_emergency_contacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_emergency_contacts_employeeId_idx"
ON "employee_emergency_contacts"("employeeId");

ALTER TABLE "employee_emergency_contacts"
ADD CONSTRAINT "employee_emergency_contacts_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
