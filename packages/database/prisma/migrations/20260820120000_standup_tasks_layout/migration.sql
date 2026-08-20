-- Stand-up redesign: structured tasks, miscellaneous notes, layout preference.
-- Assumes no meaningful stand-up data; clears related rows so FTS/schema changes are unblocked.

DELETE FROM "attendance_records";
DELETE FROM "project_allocations";
DELETE FROM "standup_entries";
UPDATE "standups" SET "yjsState" = NULL;

-- Layout preference on users
CREATE TYPE "StandupLayoutPreference" AS ENUM ('card', 'table');
ALTER TABLE "users"
  ADD COLUMN "standupLayoutPreference" "StandupLayoutPreference" NOT NULL DEFAULT 'card';

-- Rename notesMarkdown -> miscellaneousNotes (drop FTS trigger that references old column)
DROP TRIGGER IF EXISTS standup_entries_search_vector_trigger ON standup_entries;

ALTER TABLE "standup_entries" RENAME COLUMN "notesMarkdown" TO "miscellaneousNotes";

-- Task state enum + table
CREATE TYPE "StandupTaskState" AS ENUM ('open', 'done', 'tomorrow', 'progress');

CREATE TABLE "standup_tasks" (
  "id" TEXT NOT NULL,
  "allocationId" TEXT NOT NULL,
  "text" TEXT NOT NULL DEFAULT '',
  "state" "StandupTaskState" NOT NULL DEFAULT 'open',
  "blocker" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "standup_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "standup_tasks_allocationId_sortOrder_idx"
  ON "standup_tasks"("allocationId", "sortOrder");

ALTER TABLE "standup_tasks"
  ADD CONSTRAINT "standup_tasks_allocationId_fkey"
  FOREIGN KEY ("allocationId") REFERENCES "project_allocations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Rebuild search document to include misc notes, project names, and task text/blockers
CREATE OR REPLACE FUNCTION standup_entry_search_document(
  p_employee_id text,
  p_notes text,
  p_entry_id text
) RETURNS TABLE(search_text text, search_vector tsvector) AS $$
  WITH doc AS (
    SELECT lower(trim(
      coalesce((SELECT name FROM employees WHERE id = p_employee_id), '') || ' ' ||
      coalesce(p_notes, '') || ' ' ||
      coalesce((
        SELECT string_agg(p.name, ' ')
        FROM project_allocations pa
        JOIN projects p ON p.id = pa."projectId"
        WHERE pa."standupEntryId" = p_entry_id
      ), '') || ' ' ||
      coalesce((
        SELECT string_agg(coalesce(st.text, '') || ' ' || coalesce(st.blocker, ''), ' ')
        FROM project_allocations pa
        JOIN standup_tasks st ON st."allocationId" = pa.id
        WHERE pa."standupEntryId" = p_entry_id
      ), '')
    )) AS text
  )
  SELECT doc.text, to_tsvector('simple', doc.text)
  FROM doc;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION standup_entry_search_vector(
  p_employee_id text,
  p_notes text,
  p_entry_id text
) RETURNS tsvector AS $$
  SELECT search_vector FROM standup_entry_search_document(p_employee_id, p_notes, p_entry_id);
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION update_standup_entry_search_vector()
RETURNS trigger AS $$
DECLARE
  doc record;
BEGIN
  SELECT d.search_text, d.search_vector
  INTO doc
  FROM standup_entry_search_document(NEW."employeeId", NEW."miscellaneousNotes", NEW.id) d;

  NEW.search_text := doc.search_text;
  NEW.search_vector := doc.search_vector;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER standup_entries_search_vector_trigger
BEFORE INSERT OR UPDATE OF "employeeId", "miscellaneousNotes" ON standup_entries
FOR EACH ROW EXECUTE PROCEDURE update_standup_entry_search_vector();

CREATE OR REPLACE FUNCTION refresh_standup_entry_search_from_allocation()
RETURNS trigger AS $$
DECLARE
  entry_id text;
  doc record;
BEGIN
  entry_id := COALESCE(NEW."standupEntryId", OLD."standupEntryId");

  SELECT d.search_text, d.search_vector
  INTO doc
  FROM standup_entries se
  CROSS JOIN LATERAL standup_entry_search_document(
    se."employeeId",
    se."miscellaneousNotes",
    se.id
  ) d
  WHERE se.id = entry_id;

  UPDATE standup_entries
  SET
    search_text = doc.search_text,
    search_vector = doc.search_vector
  WHERE id = entry_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_standup_entry_search_from_task()
RETURNS trigger AS $$
DECLARE
  entry_id text;
  doc record;
BEGIN
  SELECT pa."standupEntryId"
  INTO entry_id
  FROM project_allocations pa
  WHERE pa.id = COALESCE(NEW."allocationId", OLD."allocationId");

  IF entry_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT d.search_text, d.search_vector
  INTO doc
  FROM standup_entries se
  CROSS JOIN LATERAL standup_entry_search_document(
    se."employeeId",
    se."miscellaneousNotes",
    se.id
  ) d
  WHERE se.id = entry_id;

  UPDATE standup_entries
  SET
    search_text = doc.search_text,
    search_vector = doc.search_vector
  WHERE id = entry_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS standup_tasks_search_refresh ON standup_tasks;
CREATE TRIGGER standup_tasks_search_refresh
AFTER INSERT OR UPDATE OR DELETE ON standup_tasks
FOR EACH ROW EXECUTE PROCEDURE refresh_standup_entry_search_from_task();

UPDATE standup_entries se
SET
  search_text = docs.search_text,
  search_vector = docs.search_vector
FROM (
  SELECT
    se2.id,
    doc.search_text,
    doc.search_vector
  FROM standup_entries se2
  CROSS JOIN LATERAL standup_entry_search_document(
    se2."employeeId",
    se2."miscellaneousNotes",
    se2.id
  ) doc
) docs
WHERE se.id = docs.id;
