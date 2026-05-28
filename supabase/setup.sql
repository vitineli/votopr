CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.current_user_org_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(organization_id), ARRAY[]::uuid[])
  FROM organization_members
  WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    nullif(NEW.raw_user_meta_data->>'name', ''),
    nullif(NEW.raw_user_meta_data->>'avatar_url', '')
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        name = coalesce(EXCLUDED.name, public.users.name),
        avatar_url = coalesce(EXCLUDED.avatar_url, public.users.avatar_url);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT OR UPDATE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE electoral_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE municipalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE electoral_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE electoral_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE electoral_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE electoral_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE neighborhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE territorial_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE electoral_import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE territorial_vote_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE political_leaders ENABLE ROW LEVEL SECURITY;
ALTER TABLE political_supporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE political_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE political_demands ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_plan_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategic_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own profile"
ON users FOR SELECT
USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
ON users FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "Members can read their organizations"
ON organizations FOR SELECT
USING (id = ANY(private.current_user_org_ids()));

CREATE POLICY "Members can read memberships"
ON organization_members FOR SELECT
USING (organization_id = ANY(private.current_user_org_ids()));

CREATE POLICY "Owners and admins manage memberships"
ON organization_members FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organization_members.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organization_members.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN')
  )
);

CREATE POLICY "Members can read campaigns"
ON campaigns FOR SELECT
USING (organization_id = ANY(private.current_user_org_ids()));

CREATE POLICY "Admins and analysts manage campaigns"
ON campaigns FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = campaigns.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = campaigns.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
);

CREATE POLICY "Members can read uploads"
ON electoral_uploads FOR SELECT
USING (organization_id = ANY(private.current_user_org_ids()));

CREATE POLICY "Admins and analysts manage uploads"
ON electoral_uploads FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = electoral_uploads.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = electoral_uploads.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
);

CREATE POLICY "Authenticated users can read PR geography"
ON municipalities FOR SELECT
USING (auth.role() = 'authenticated' AND state = 'PR');

CREATE POLICY "Authenticated users can read PR zones"
ON electoral_zones FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM municipalities m
    WHERE m.id = electoral_zones.municipality_id
      AND m.state = 'PR'
  )
);

CREATE POLICY "Authenticated users can read PR sections"
ON electoral_sections FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM municipalities m
    WHERE m.id = electoral_sections.municipality_id
      AND m.state = 'PR'
  )
);

CREATE POLICY "Authenticated users can read candidates"
ON candidates FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read electoral offices"
ON electoral_offices FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read parties"
ON parties FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read PR neighborhoods"
ON neighborhoods FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM municipalities m
    WHERE m.id = neighborhoods.municipality_id
      AND m.state = 'PR'
  )
);

CREATE POLICY "Authenticated users can read PR regions"
ON territorial_regions FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Members can read electoral facts"
ON electoral_data FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = electoral_data.campaign_id
      AND c.organization_id = ANY(private.current_user_org_ids())
  )
);

CREATE POLICY "Members can read import errors"
ON electoral_import_errors FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM electoral_uploads eu
    WHERE eu.id = electoral_import_errors.upload_id
      AND eu.organization_id = ANY(private.current_user_org_ids())
  )
);

CREATE POLICY "Members can read territorial summaries"
ON territorial_vote_summaries FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = territorial_vote_summaries.campaign_id
      AND c.organization_id = ANY(private.current_user_org_ids())
  )
);

CREATE POLICY "Members can read political leaders"
ON political_leaders FOR SELECT
USING (organization_id = ANY(private.current_user_org_ids()));

CREATE POLICY "Admins and analysts manage political leaders"
ON political_leaders FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = political_leaders.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = political_leaders.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
);

CREATE POLICY "Members can read political supporters"
ON political_supporters FOR SELECT
USING (organization_id = ANY(private.current_user_org_ids()));

CREATE POLICY "Admins and analysts manage political supporters"
ON political_supporters FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = political_supporters.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = political_supporters.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
);

CREATE POLICY "Members can read field visits"
ON field_visits FOR SELECT
USING (organization_id = ANY(private.current_user_org_ids()));

CREATE POLICY "Admins and analysts manage field visits"
ON field_visits FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = field_visits.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = field_visits.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
);

CREATE POLICY "Members can read political events"
ON political_events FOR SELECT
USING (organization_id = ANY(private.current_user_org_ids()));

CREATE POLICY "Admins and analysts manage political events"
ON political_events FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = political_events.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = political_events.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
);

CREATE POLICY "Members can read political demands"
ON political_demands FOR SELECT
USING (organization_id = ANY(private.current_user_org_ids()));

CREATE POLICY "Admins and analysts manage political demands"
ON political_demands FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = political_demands.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = political_demands.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
);

CREATE POLICY "Members can read operation plans"
ON operation_plans FOR SELECT
USING (organization_id = ANY(private.current_user_org_ids()));

CREATE POLICY "Admins and analysts manage operation plans"
ON operation_plans FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = operation_plans.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = operation_plans.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
);

CREATE POLICY "Members can read operation plan allocations"
ON operation_plan_allocations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM operation_plans op
    WHERE op.id = operation_plan_allocations.plan_id
      AND op.organization_id = ANY(private.current_user_org_ids())
  )
);

CREATE POLICY "Admins and analysts manage operation plan allocations"
ON operation_plan_allocations FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM operation_plans op
    JOIN organization_members om ON om.organization_id = op.organization_id
    WHERE op.id = operation_plan_allocations.plan_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM operation_plans op
    JOIN organization_members om ON om.organization_id = op.organization_id
    WHERE op.id = operation_plan_allocations.plan_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
);

CREATE POLICY "Members can read strategic insights"
ON strategic_insights FOR SELECT
USING (organization_id = ANY(private.current_user_org_ids()));

CREATE POLICY "Admins and analysts manage strategic insights"
ON strategic_insights FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = strategic_insights.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = strategic_insights.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('OWNER', 'ADMIN', 'ANALYST')
  )
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'electoral-uploads',
  'electoral-uploads',
  false,
  3221225472,
  ARRAY['text/csv', 'application/vnd.ms-excel', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Organization members can upload electoral CSV files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'electoral-uploads'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Organization members can read electoral CSV files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'electoral-uploads'
  AND auth.role() = 'authenticated'
);
