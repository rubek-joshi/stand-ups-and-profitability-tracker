-- Full-text search on stand-up entries (employee name, project names, notes)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "standup_entries" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

CREATE OR REPLACE FUNCTION standup_entry_search_vector(
  p_employee_id text,
  p_notes text,
  p_entry_id text
) RETURNS tsvector AS $$
  SELECT to_tsvector(
    'simple',
    coalesce((SELECT name FROM employees WHERE id = p_employee_id), '') || ' ' ||
    coalesce(p_notes, '') || ' ' ||
    coalesce((
      SELECT string_agg(p.name, ' ')
      FROM project_allocations pa
      JOIN projects p ON p.id = pa."projectId"
      WHERE pa."standupEntryId" = p_entry_id
    ), '')
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION update_standup_entry_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := standup_entry_search_vector(
    NEW."employeeId",
    NEW."notesMarkdown",
    NEW.id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS standup_entries_search_vector_trigger ON standup_entries;
CREATE TRIGGER standup_entries_search_vector_trigger
BEFORE INSERT OR UPDATE OF "employeeId", "notesMarkdown" ON standup_entries
FOR EACH ROW EXECUTE PROCEDURE update_standup_entry_search_vector();

CREATE OR REPLACE FUNCTION refresh_standup_entry_search_from_allocation()
RETURNS trigger AS $$
DECLARE
  entry_id text;
BEGIN
  entry_id := COALESCE(NEW."standupEntryId", OLD."standupEntryId");
  UPDATE standup_entries se
  SET search_vector = standup_entry_search_vector(se."employeeId", se."notesMarkdown", se.id)
  WHERE se.id = entry_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS project_allocations_search_refresh ON project_allocations;
CREATE TRIGGER project_allocations_search_refresh
AFTER INSERT OR UPDATE OR DELETE ON project_allocations
FOR EACH ROW EXECUTE PROCEDURE refresh_standup_entry_search_from_allocation();

UPDATE standup_entries se
SET search_vector = standup_entry_search_vector(se."employeeId", se."notesMarkdown", se.id);

CREATE INDEX IF NOT EXISTS "standup_entries_search_vector_idx"
ON "standup_entries" USING gin ("search_vector");

CREATE INDEX IF NOT EXISTS "standups_date_id_desc_idx"
ON "standups" ("date" DESC, "id" DESC);
