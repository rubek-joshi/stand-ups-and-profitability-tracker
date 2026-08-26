ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_MARKED_PAID';
ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_DELETED';

CREATE TYPE "InvoiceStatus" AS ENUM ('pending', 'paid');

CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "amountPaisa" BIGINT NOT NULL,
    "vatPaisa" BIGINT NOT NULL DEFAULT 0,
    "totalPaisa" BIGINT NOT NULL,
    "vatRateApplied" INTEGER NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'pending',
    "paymentDate" DATE,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");
CREATE INDEX "invoices_projectId_idx" ON "invoices"("projectId");
CREATE INDEX "invoices_status_idx" ON "invoices"("status");
CREATE INDEX "invoices_invoiceDate_idx" ON "invoices"("invoiceDate");

ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "casbin_rule" ("ptype", "v0", "v1", "v2")
SELECT 'p', 'admin', 'invoices', '*'
WHERE NOT EXISTS (
  SELECT 1 FROM "casbin_rule"
  WHERE "ptype" = 'p' AND "v0" = 'admin' AND "v1" = 'invoices' AND "v2" = '*'
);

INSERT INTO "casbin_rule" ("ptype", "v0", "v1", "v2")
SELECT 'p', 'manager', 'invoices', 'read'
WHERE NOT EXISTS (
  SELECT 1 FROM "casbin_rule"
  WHERE "ptype" = 'p' AND "v0" = 'manager' AND "v1" = 'invoices' AND "v2" = 'read'
);
