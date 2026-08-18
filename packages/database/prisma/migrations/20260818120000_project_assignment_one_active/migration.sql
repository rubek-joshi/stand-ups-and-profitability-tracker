-- Remove duplicate active employee-project assignments (keep earliest assignedAt).
DELETE FROM project_assignments pa
WHERE pa."unassignedAt" IS NULL
  AND pa.id NOT IN (
    SELECT DISTINCT ON ("employeeId", "projectId") id
    FROM project_assignments
    WHERE "unassignedAt" IS NULL
    ORDER BY "employeeId", "projectId", "assignedAt" ASC, id ASC
  );

-- One open assignment per employee per project.
CREATE UNIQUE INDEX "project_assignments_one_active_per_employee_project"
ON "project_assignments" ("employeeId", "projectId")
WHERE "unassignedAt" IS NULL;
