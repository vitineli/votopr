CREATE TABLE voting_place_geocodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  voting_place_number integer NOT NULL,
  voting_place_name text NOT NULL,
  address text NOT NULL,
  query text NOT NULL,
  provider text NOT NULL,
  provider_place_id text,
  status text NOT NULL,
  confidence numeric(5,4),
  latitude numeric(10,7),
  longitude numeric(10,7),
  geom geometry(Point, 4326),
  matched_display_name text,
  raw_response jsonb,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (municipality_id, voting_place_number, provider)
);

CREATE INDEX voting_place_geocodes_municipality_status_idx
  ON voting_place_geocodes(municipality_id, status);

CREATE INDEX voting_place_geocodes_provider_idx
  ON voting_place_geocodes(provider);

CREATE INDEX voting_place_geocodes_geom_gix
  ON voting_place_geocodes USING gist(geom)
  WHERE geom IS NOT NULL;

CREATE TRIGGER voting_place_geocodes_updated_at
  BEFORE UPDATE ON voting_place_geocodes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
