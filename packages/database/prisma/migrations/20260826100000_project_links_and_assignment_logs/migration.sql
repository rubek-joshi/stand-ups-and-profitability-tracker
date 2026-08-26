ALTER TYPE "AuditAction" ADD VALUE 'PROJECT_ASSIGNMENT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'CORE_MEMBER_ASSIGNMENT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'PROJECT_LINK_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PROJECT_LINK_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PROJECT_LINK_DELETED';

CREATE TABLE "project_links" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_links_projectId_idx" ON "project_links"("projectId");

ALTER TABLE "project_links"
ADD CONSTRAINT "project_links_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
