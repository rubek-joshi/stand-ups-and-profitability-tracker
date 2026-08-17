-- Fuzzy search support via pg_trgm on plain-text search document
ALTER TABLE "standup_entries" ADD COLUMN IF NOT EXISTS "search_text" text NOT NULL DEFAULT '';

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
      ), '')
    )) AS text
  )
  SELECT doc.text, to_tsvector('simple', doc.text)
  FROM doc;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION standup_entry_matches_search(
  p_search_text text,
  p_search_vector tsvector,
  p_query text
) RETURNS boolean AS $$
DECLARE
  normalized_query text;
  raw_term text;
  term text;
  checked_terms integer := 0;
BEGIN
  normalized_query := trim(coalesce(p_query, ''));
  IF normalized_query = '' THEN
    RETURN true;
  END IF;

  IF p_search_vector @@ websearch_to_tsquery('simple', normalized_query) THEN
    RETURN true;
  END IF;

  FOR raw_term IN
    SELECT unnest(regexp_split_to_array(normalized_query, '\s+'))
  LOOP
    term := lower(trim(both '"' from raw_term));
    IF term = '' THEN
      CONTINUE;
    END IF;
    checked_terms := checked_terms + 1;

    IF length(term) < 2 THEN
      IF p_search_text NOT ILIKE ('%' || term || '%') THEN
        RETURN false;
      END IF;
      CONTINUE;
    END IF;

    IF NOT (
      p_search_text ILIKE ('%' || term || '%')
      OR p_search_text % term
      OR word_similarity(term, p_search_text) >= 0.35
    ) THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN checked_terms > 0;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION update_standup_entry_search_vector()
RETURNS trigger AS $$
DECLARE
  doc record;
BEGIN
  SELECT d.search_text, d.search_vector
  INTO doc
  FROM standup_entry_search_document(NEW."employeeId", NEW."notesMarkdown", NEW.id) d;

  NEW.search_text := doc.search_text;
  NEW.search_vector := doc.search_vector;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
    se."notesMarkdown",
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
    se2."notesMarkdown",
    se2.id
  ) doc
) docs
WHERE se.id = docs.id;

CREATE INDEX IF NOT EXISTS "standup_entries_search_text_trgm_idx"
ON "standup_entries" USING gin ("search_text" gin_trgm_ops);
