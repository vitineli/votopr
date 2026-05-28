CREATE INDEX territorial_vote_summaries_map_candidate_idx
  ON territorial_vote_summaries(campaign_id, territory_level, candidate_id, election_year, round)
  WHERE candidate_id IS NOT NULL;

CREATE INDEX territorial_vote_summaries_map_office_idx
  ON territorial_vote_summaries(campaign_id, territory_level, office_id, election_year, round)
  WHERE office_id IS NOT NULL;

CREATE INDEX territorial_vote_summaries_map_party_idx
  ON territorial_vote_summaries(campaign_id, territory_level, party_id, election_year, round)
  WHERE party_id IS NOT NULL;

CREATE INDEX territorial_vote_summaries_map_upload_idx
  ON territorial_vote_summaries(upload_id, territory_level, election_year, round)
  WHERE upload_id IS NOT NULL;

CREATE INDEX electoral_sections_geom_not_null_gix
  ON electoral_sections USING gist(geom)
  WHERE geom IS NOT NULL;

CREATE INDEX municipalities_boundary_not_null_gix
  ON municipalities USING gist(boundary)
  WHERE boundary IS NOT NULL;

CREATE INDEX neighborhoods_boundary_not_null_gix
  ON neighborhoods USING gist(boundary)
  WHERE boundary IS NOT NULL;

CREATE INDEX electoral_zones_boundary_not_null_gix
  ON electoral_zones USING gist(boundary)
  WHERE boundary IS NOT NULL;
