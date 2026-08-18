-- Rename client contact blob and add structured contact fields.
ALTER TABLE "clients" RENAME COLUMN "contactInfo" TO "additionalInfo";
ALTER TABLE "clients" ADD COLUMN "email" TEXT;
ALTER TABLE "clients" ADD COLUMN "phone" TEXT;

ALTER TABLE "employees" ADD COLUMN "contactNumber" TEXT;
ALTER TABLE "core_members" ADD COLUMN "contactNumber" TEXT;
