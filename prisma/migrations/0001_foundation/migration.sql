CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'ANALYST', 'VIEWER');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "UploadStatus" AS ENUM ('CREATED', 'UPLOADED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "CandidateKind" AS ENUM ('CANDIDATE', 'PARTY', 'BLANK', 'NULL', 'OTHER');

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email citext NOT NULL UNIQUE,
  name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'professional',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role "MembershipRole" NOT NULL DEFAULT 'ANALYST',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  election_year integer NOT NULL,
  state text NOT NULL DEFAULT 'PR',
  regional_focus text[] NOT NULL DEFAULT ARRAY['CURITIBA', 'SÃO JOSÉ DOS PINHAIS', 'REGIÃO METROPOLITANA DE CURITIBA'],
  status "CampaignStatus" NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE electoral_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  storage_path text NOT NULL,
  checksum text,
  status "UploadStatus" NOT NULL DEFAULT 'CREATED',
  total_rows integer NOT NULL DEFAULT 0,
  processed_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE municipalities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tse_code integer NOT NULL UNIQUE,
  ibge_code integer UNIQUE,
  name text NOT NULL,
  normalized text NOT NULL,
  state text NOT NULL DEFAULT 'PR',
  region text,
  is_priority boolean NOT NULL DEFAULT false,
  boundary geometry(MultiPolygon, 4326),
  centroid geometry(Point, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE electoral_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  number integer NOT NULL,
  boundary geometry(MultiPolygon, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (municipality_id, number)
);

CREATE TABLE electoral_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  electoral_zone_id uuid NOT NULL REFERENCES electoral_zones(id) ON DELETE CASCADE,
  number integer NOT NULL,
  voting_place_number integer NOT NULL,
  voting_place_name text NOT NULL,
  address text NOT NULL,
  neighborhood text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  geom geometry(Point, 4326),
  geocoded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (municipality_id, electoral_zone_id, number)
);

CREATE TABLE candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_year integer NOT NULL,
  office_code integer NOT NULL,
  office_name text NOT NULL,
  ballot_number integer NOT NULL,
  candidate_seq bigint NOT NULL,
  name text NOT NULL,
  normalized_name text NOT NULL,
  kind "CandidateKind" NOT NULL DEFAULT 'CANDIDATE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (election_year, office_code, ballot_number, candidate_seq)
);

CREATE TABLE electoral_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES electoral_uploads(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  municipality_id uuid NOT NULL REFERENCES municipalities(id) ON DELETE RESTRICT,
  electoral_zone_id uuid NOT NULL REFERENCES electoral_zones(id) ON DELETE RESTRICT,
  section_id uuid NOT NULL REFERENCES electoral_sections(id) ON DELETE RESTRICT,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
  election_year integer NOT NULL,
  election_code integer NOT NULL,
  round integer NOT NULL,
  office_code integer NOT NULL,
  votes integer NOT NULL CHECK (votes >= 0),
  election_date date NOT NULL,
  generated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organization_members_user_id_idx ON organization_members(user_id);
CREATE INDEX campaigns_organization_id_status_idx ON campaigns(organization_id, status);
CREATE INDEX electoral_uploads_organization_id_status_created_at_idx ON electoral_uploads(organization_id, status, created_at DESC);
CREATE INDEX electoral_uploads_campaign_id_status_idx ON electoral_uploads(campaign_id, status);
CREATE INDEX municipalities_state_is_priority_idx ON municipalities(state, is_priority);
CREATE INDEX municipalities_normalized_idx ON municipalities(normalized);
CREATE INDEX municipalities_boundary_gix ON municipalities USING gist(boundary);
CREATE INDEX municipalities_centroid_gix ON municipalities USING gist(centroid);
CREATE INDEX electoral_zones_number_idx ON electoral_zones(number);
CREATE INDEX electoral_zones_boundary_gix ON electoral_zones USING gist(boundary);
CREATE INDEX electoral_sections_municipality_id_voting_place_number_idx ON electoral_sections(municipality_id, voting_place_number);
CREATE INDEX electoral_sections_neighborhood_idx ON electoral_sections(neighborhood);
CREATE INDEX electoral_sections_geom_gix ON electoral_sections USING gist(geom);
CREATE INDEX candidates_election_year_office_code_normalized_name_idx ON candidates(election_year, office_code, normalized_name);
CREATE INDEX candidates_kind_idx ON candidates(kind);
CREATE INDEX electoral_data_campaign_id_election_year_office_code_idx ON electoral_data(campaign_id, election_year, office_code);
CREATE INDEX electoral_data_municipality_id_office_code_candidate_id_idx ON electoral_data(municipality_id, office_code, candidate_id);
CREATE INDEX electoral_data_electoral_zone_id_candidate_id_idx ON electoral_data(electoral_zone_id, candidate_id);
CREATE INDEX electoral_data_section_id_idx ON electoral_data(section_id);
CREATE INDEX electoral_data_candidate_id_idx ON electoral_data(candidate_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER electoral_uploads_updated_at BEFORE UPDATE ON electoral_uploads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER municipalities_updated_at BEFORE UPDATE ON municipalities FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER electoral_zones_updated_at BEFORE UPDATE ON electoral_zones FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER electoral_sections_updated_at BEFORE UPDATE ON electoral_sections FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER candidates_updated_at BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
