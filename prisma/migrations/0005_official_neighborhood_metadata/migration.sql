CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE neighborhoods
  ADD COLUMN slug text,
  ADD COLUMN official_code text,
  ADD COLUMN source_url text,
  ADD COLUMN imported_at timestamptz;

UPDATE neighborhoods
SET slug = lower(regexp_replace(normalized, '[^A-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

ALTER TABLE neighborhoods
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX neighborhoods_municipality_slug_key
  ON neighborhoods(municipality_id, slug);

CREATE INDEX neighborhoods_slug_idx
  ON neighborhoods(slug);

CREATE INDEX neighborhoods_name_trgm_idx
  ON neighborhoods USING gin(name gin_trgm_ops);
