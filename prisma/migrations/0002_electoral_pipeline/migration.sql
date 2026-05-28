CREATE TYPE "TerritoryLevel" AS ENUM (
  'STATE',
  'METROPOLITAN_REGION',
  'MUNICIPALITY',
  'NEIGHBORHOOD',
  'ZONE',
  'SECTION'
);

CREATE TYPE "ImportErrorSeverity" AS ENUM ('WARNING', 'ERROR', 'FATAL');

ALTER TABLE electoral_uploads
  ADD COLUMN parser_version text NOT NULL DEFAULT 'tse-section-votes-v2';

CREATE TABLE electoral_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code integer NOT NULL UNIQUE,
  name text NOT NULL,
  normalized text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acronym text NOT NULL,
  normalized text NOT NULL,
  number integer,
  name text,
  election_year integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (acronym, election_year)
);

CREATE TABLE neighborhoods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  boundary geometry(MultiPolygon, 4326),
  centroid geometry(Point, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (municipality_id, normalized)
);

CREATE TABLE territorial_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid REFERENCES municipalities(id) ON DELETE CASCADE,
  level "TerritoryLevel" NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  normalized text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  boundary geometry(MultiPolygon, 4326),
  centroid geometry(Point, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (level, code)
);

ALTER TABLE electoral_sections
  ADD COLUMN neighborhood_id uuid REFERENCES neighborhoods(id) ON DELETE SET NULL,
  ADD COLUMN region_id uuid REFERENCES territorial_regions(id) ON DELETE SET NULL;

ALTER TABLE candidates
  ADD COLUMN office_id uuid REFERENCES electoral_offices(id) ON DELETE SET NULL,
  ADD COLUMN party_id uuid REFERENCES parties(id) ON DELETE SET NULL;

ALTER TABLE electoral_data
  ADD COLUMN office_id uuid REFERENCES electoral_offices(id) ON DELETE SET NULL,
  ADD COLUMN party_id uuid REFERENCES parties(id) ON DELETE SET NULL;

CREATE TABLE electoral_import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES electoral_uploads(id) ON DELETE CASCADE,
  row_number integer,
  code text NOT NULL,
  severity "ImportErrorSeverity" NOT NULL DEFAULT 'ERROR',
  message text NOT NULL,
  raw_row jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE territorial_vote_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  upload_id uuid REFERENCES electoral_uploads(id) ON DELETE CASCADE,
  election_year integer NOT NULL,
  election_code integer NOT NULL,
  round integer NOT NULL,
  territory_level "TerritoryLevel" NOT NULL,
  municipality_id uuid REFERENCES municipalities(id) ON DELETE CASCADE,
  electoral_zone_id uuid REFERENCES electoral_zones(id) ON DELETE CASCADE,
  section_id uuid REFERENCES electoral_sections(id) ON DELETE CASCADE,
  neighborhood_id uuid REFERENCES neighborhoods(id) ON DELETE CASCADE,
  territorial_region_id uuid REFERENCES territorial_regions(id) ON DELETE CASCADE,
  office_id uuid REFERENCES electoral_offices(id) ON DELETE SET NULL,
  party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
  votes integer NOT NULL CHECK (votes >= 0),
  total_votes integer NOT NULL DEFAULT 0 CHECK (total_votes >= 0),
  vote_share numeric(8,5),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX territorial_vote_summaries_unique_scope_idx
  ON territorial_vote_summaries (
    campaign_id,
    election_year,
    election_code,
    round,
    territory_level,
    COALESCE(municipality_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(electoral_zone_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(section_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(neighborhood_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(territorial_region_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(office_id, '00000000-0000-0000-0000-000000000000'::uuid),
    candidate_id
  );

CREATE INDEX electoral_offices_normalized_idx ON electoral_offices(normalized);
CREATE INDEX parties_number_idx ON parties(number);
CREATE INDEX parties_normalized_idx ON parties(normalized);
CREATE INDEX neighborhoods_normalized_idx ON neighborhoods(normalized);
CREATE INDEX neighborhoods_boundary_gix ON neighborhoods USING gist(boundary);
CREATE INDEX neighborhoods_centroid_gix ON neighborhoods USING gist(centroid);
CREATE INDEX territorial_regions_municipality_id_level_idx ON territorial_regions(municipality_id, level);
CREATE INDEX territorial_regions_normalized_idx ON territorial_regions(normalized);
CREATE INDEX territorial_regions_boundary_gix ON territorial_regions USING gist(boundary);
CREATE INDEX territorial_regions_centroid_gix ON territorial_regions USING gist(centroid);
CREATE INDEX electoral_sections_neighborhood_id_idx ON electoral_sections(neighborhood_id);
CREATE INDEX electoral_sections_region_id_idx ON electoral_sections(region_id);
CREATE INDEX candidates_office_id_idx ON candidates(office_id);
CREATE INDEX candidates_party_id_idx ON candidates(party_id);
CREATE INDEX electoral_data_office_id_candidate_id_idx ON electoral_data(office_id, candidate_id);
CREATE INDEX electoral_data_party_id_idx ON electoral_data(party_id);
CREATE INDEX electoral_import_errors_upload_id_severity_idx ON electoral_import_errors(upload_id, severity);
CREATE INDEX electoral_import_errors_code_idx ON electoral_import_errors(code);
CREATE INDEX territorial_vote_summaries_campaign_level_year_round_idx
  ON territorial_vote_summaries(campaign_id, territory_level, election_year, round);
CREATE INDEX territorial_vote_summaries_municipality_office_candidate_idx
  ON territorial_vote_summaries(municipality_id, office_id, candidate_id);
CREATE INDEX territorial_vote_summaries_zone_office_candidate_idx
  ON territorial_vote_summaries(electoral_zone_id, office_id, candidate_id);
CREATE INDEX territorial_vote_summaries_section_office_candidate_idx
  ON territorial_vote_summaries(section_id, office_id, candidate_id);
CREATE INDEX territorial_vote_summaries_neighborhood_office_candidate_idx
  ON territorial_vote_summaries(neighborhood_id, office_id, candidate_id);
CREATE INDEX territorial_vote_summaries_region_office_candidate_idx
  ON territorial_vote_summaries(territorial_region_id, office_id, candidate_id);

CREATE INDEX electoral_data_campaign_municipality_round_office_idx
  ON electoral_data(campaign_id, municipality_id, election_year, round, office_code);
CREATE INDEX electoral_data_campaign_zone_round_office_idx
  ON electoral_data(campaign_id, electoral_zone_id, election_year, round, office_code);
CREATE INDEX electoral_data_campaign_section_round_office_idx
  ON electoral_data(campaign_id, section_id, election_year, round, office_code);

CREATE TRIGGER electoral_offices_updated_at BEFORE UPDATE ON electoral_offices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER parties_updated_at BEFORE UPDATE ON parties FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER neighborhoods_updated_at BEFORE UPDATE ON neighborhoods FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER territorial_regions_updated_at BEFORE UPDATE ON territorial_regions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER territorial_vote_summaries_updated_at BEFORE UPDATE ON territorial_vote_summaries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
