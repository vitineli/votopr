ALTER TABLE electoral_sections
  ADD COLUMN neighborhood_assigned_at timestamptz,
  ADD COLUMN neighborhood_assignment_method text,
  ADD COLUMN neighborhood_assignment_confidence numeric(5,4);

CREATE INDEX electoral_sections_neighborhood_assignment_method_idx
  ON electoral_sections(neighborhood_assignment_method)
  WHERE neighborhood_assignment_method IS NOT NULL;
