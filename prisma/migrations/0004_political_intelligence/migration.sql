CREATE TYPE "PoliticalContactStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'SUPPORTER', 'UNDECIDED', 'OPPOSED', 'INACTIVE');
CREATE TYPE "InfluenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'STRATEGIC');
CREATE TYPE "FieldVisitStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "PoliticalDemandStatus" AS ENUM ('OPEN', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');
CREATE TYPE "CampaignEventType" AS ENUM ('WALK', 'MEETING', 'RALLY', 'CANVASSING', 'TRAINING', 'COMMUNITY');
CREATE TYPE "CampaignEventStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "OperationPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "StrategicInsightType" AS ENUM ('OPPORTUNITY', 'RISK', 'ALERT', 'RECOMMENDATION', 'NEGLECTED_AREA', 'ORPHAN_VOTES');
CREATE TYPE "StrategicInsightSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE political_leaders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  role text,
  influence "InfluenceLevel" NOT NULL DEFAULT 'MEDIUM',
  status "PoliticalContactStatus" NOT NULL DEFAULT 'PROSPECT',
  territory_level "TerritoryLevel" NOT NULL DEFAULT 'MUNICIPALITY',
  municipality_id uuid REFERENCES municipalities(id) ON DELETE SET NULL,
  electoral_zone_id uuid REFERENCES electoral_zones(id) ON DELETE SET NULL,
  section_id uuid REFERENCES electoral_sections(id) ON DELETE SET NULL,
  neighborhood_id uuid REFERENCES neighborhoods(id) ON DELETE SET NULL,
  estimated_votes integer NOT NULL DEFAULT 0 CHECK (estimated_votes >= 0),
  reliability_score integer NOT NULL DEFAULT 50 CHECK (reliability_score BETWEEN 0 AND 100),
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE political_supporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  leader_id uuid REFERENCES political_leaders(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text,
  email text,
  status "PoliticalContactStatus" NOT NULL DEFAULT 'PROSPECT',
  territory_level "TerritoryLevel" NOT NULL DEFAULT 'MUNICIPALITY',
  municipality_id uuid REFERENCES municipalities(id) ON DELETE SET NULL,
  electoral_zone_id uuid REFERENCES electoral_zones(id) ON DELETE SET NULL,
  section_id uuid REFERENCES electoral_sections(id) ON DELETE SET NULL,
  neighborhood_id uuid REFERENCES neighborhoods(id) ON DELETE SET NULL,
  vote_commitment_score integer NOT NULL DEFAULT 50 CHECK (vote_commitment_score BETWEEN 0 AND 100),
  contact_preference text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE field_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  leader_id uuid REFERENCES political_leaders(id) ON DELETE SET NULL,
  supporter_id uuid REFERENCES political_supporters(id) ON DELETE SET NULL,
  assigned_to text,
  objective text NOT NULL,
  result text,
  status "FieldVisitStatus" NOT NULL DEFAULT 'PLANNED',
  territory_level "TerritoryLevel" NOT NULL DEFAULT 'MUNICIPALITY',
  municipality_id uuid REFERENCES municipalities(id) ON DELETE SET NULL,
  electoral_zone_id uuid REFERENCES electoral_zones(id) ON DELETE SET NULL,
  section_id uuid REFERENCES electoral_sections(id) ON DELETE SET NULL,
  neighborhood_id uuid REFERENCES neighborhoods(id) ON DELETE SET NULL,
  scheduled_for timestamptz,
  completed_at timestamptz,
  voters_reached integer NOT NULL DEFAULT 0 CHECK (voters_reached >= 0),
  cost numeric(12,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE political_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  leader_id uuid REFERENCES political_leaders(id) ON DELETE SET NULL,
  name text NOT NULL,
  event_type "CampaignEventType" NOT NULL DEFAULT 'MEETING',
  status "CampaignEventStatus" NOT NULL DEFAULT 'PLANNED',
  territory_level "TerritoryLevel" NOT NULL DEFAULT 'MUNICIPALITY',
  municipality_id uuid REFERENCES municipalities(id) ON DELETE SET NULL,
  electoral_zone_id uuid REFERENCES electoral_zones(id) ON DELETE SET NULL,
  section_id uuid REFERENCES electoral_sections(id) ON DELETE SET NULL,
  neighborhood_id uuid REFERENCES neighborhoods(id) ON DELETE SET NULL,
  starts_at timestamptz,
  expected_audience integer NOT NULL DEFAULT 0 CHECK (expected_audience >= 0),
  actual_audience integer NOT NULL DEFAULT 0 CHECK (actual_audience >= 0),
  cost numeric(12,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE political_demands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  leader_id uuid REFERENCES political_leaders(id) ON DELETE SET NULL,
  title text NOT NULL,
  category text NOT NULL,
  priority integer NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status "PoliticalDemandStatus" NOT NULL DEFAULT 'OPEN',
  territory_level "TerritoryLevel" NOT NULL DEFAULT 'MUNICIPALITY',
  municipality_id uuid REFERENCES municipalities(id) ON DELETE SET NULL,
  electoral_zone_id uuid REFERENCES electoral_zones(id) ON DELETE SET NULL,
  section_id uuid REFERENCES electoral_sections(id) ON DELETE SET NULL,
  neighborhood_id uuid REFERENCES neighborhoods(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE operation_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  target_candidate_id uuid REFERENCES candidates(id) ON DELETE SET NULL,
  target_office_id uuid REFERENCES electoral_offices(id) ON DELETE SET NULL,
  name text NOT NULL,
  territory_level "TerritoryLevel" NOT NULL DEFAULT 'NEIGHBORHOOD',
  target_votes integer NOT NULL CHECK (target_votes > 0),
  field_workers integer NOT NULL CHECK (field_workers >= 0),
  vehicles integer NOT NULL CHECK (vehicles >= 0),
  budget numeric(12,2) NOT NULL CHECK (budget >= 0),
  status "OperationPlanStatus" NOT NULL DEFAULT 'DRAFT',
  algorithm_version text NOT NULL DEFAULT 'political-intelligence-v1',
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE operation_plan_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES operation_plans(id) ON DELETE CASCADE,
  territory_level "TerritoryLevel" NOT NULL,
  municipality_id uuid REFERENCES municipalities(id) ON DELETE SET NULL,
  electoral_zone_id uuid REFERENCES electoral_zones(id) ON DELETE SET NULL,
  section_id uuid REFERENCES electoral_sections(id) ON DELETE SET NULL,
  neighborhood_id uuid REFERENCES neighborhoods(id) ON DELETE SET NULL,
  territory_name text NOT NULL,
  priority_score numeric(8,3) NOT NULL,
  potential_score numeric(8,3) NOT NULL,
  difficulty_score numeric(8,3) NOT NULL,
  competition_score numeric(8,3) NOT NULL,
  opportunity_score numeric(8,3) NOT NULL,
  potential_votes integer NOT NULL DEFAULT 0 CHECK (potential_votes >= 0),
  orphan_votes integer NOT NULL DEFAULT 0 CHECK (orphan_votes >= 0),
  field_workers integer NOT NULL DEFAULT 0 CHECK (field_workers >= 0),
  vehicles integer NOT NULL DEFAULT 0 CHECK (vehicles >= 0),
  budget numeric(12,2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
  expected_votes integer NOT NULL DEFAULT 0 CHECK (expected_votes >= 0),
  cost_per_expected_vote numeric(12,2),
  rationale text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE strategic_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES candidates(id) ON DELETE SET NULL,
  type "StrategicInsightType" NOT NULL,
  severity "StrategicInsightSeverity" NOT NULL DEFAULT 'MEDIUM',
  title text NOT NULL,
  description text NOT NULL,
  recommendation text NOT NULL,
  territory_level "TerritoryLevel" NOT NULL,
  municipality_id uuid REFERENCES municipalities(id) ON DELETE SET NULL,
  electoral_zone_id uuid REFERENCES electoral_zones(id) ON DELETE SET NULL,
  section_id uuid REFERENCES electoral_sections(id) ON DELETE SET NULL,
  neighborhood_id uuid REFERENCES neighborhoods(id) ON DELETE SET NULL,
  score numeric(8,3) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX political_leaders_org_campaign_status_idx ON political_leaders(organization_id, campaign_id, status);
CREATE INDEX political_leaders_campaign_level_idx ON political_leaders(campaign_id, territory_level);
CREATE INDEX political_leaders_municipality_id_idx ON political_leaders(municipality_id);
CREATE INDEX political_leaders_electoral_zone_id_idx ON political_leaders(electoral_zone_id);
CREATE INDEX political_leaders_section_id_idx ON political_leaders(section_id);
CREATE INDEX political_leaders_neighborhood_id_idx ON political_leaders(neighborhood_id);

CREATE INDEX political_supporters_org_campaign_status_idx ON political_supporters(organization_id, campaign_id, status);
CREATE INDEX political_supporters_leader_id_idx ON political_supporters(leader_id);
CREATE INDEX political_supporters_campaign_level_idx ON political_supporters(campaign_id, territory_level);
CREATE INDEX political_supporters_municipality_id_idx ON political_supporters(municipality_id);
CREATE INDEX political_supporters_electoral_zone_id_idx ON political_supporters(electoral_zone_id);
CREATE INDEX political_supporters_section_id_idx ON political_supporters(section_id);
CREATE INDEX political_supporters_neighborhood_id_idx ON political_supporters(neighborhood_id);

CREATE INDEX field_visits_org_campaign_status_idx ON field_visits(organization_id, campaign_id, status);
CREATE INDEX field_visits_campaign_scheduled_for_idx ON field_visits(campaign_id, scheduled_for);
CREATE INDEX field_visits_leader_id_idx ON field_visits(leader_id);
CREATE INDEX field_visits_supporter_id_idx ON field_visits(supporter_id);
CREATE INDEX field_visits_municipality_id_idx ON field_visits(municipality_id);
CREATE INDEX field_visits_electoral_zone_id_idx ON field_visits(electoral_zone_id);
CREATE INDEX field_visits_section_id_idx ON field_visits(section_id);
CREATE INDEX field_visits_neighborhood_id_idx ON field_visits(neighborhood_id);

CREATE INDEX political_events_org_campaign_status_idx ON political_events(organization_id, campaign_id, status);
CREATE INDEX political_events_campaign_starts_at_idx ON political_events(campaign_id, starts_at);
CREATE INDEX political_events_leader_id_idx ON political_events(leader_id);
CREATE INDEX political_events_municipality_id_idx ON political_events(municipality_id);
CREATE INDEX political_events_electoral_zone_id_idx ON political_events(electoral_zone_id);
CREATE INDEX political_events_section_id_idx ON political_events(section_id);
CREATE INDEX political_events_neighborhood_id_idx ON political_events(neighborhood_id);

CREATE INDEX political_demands_org_campaign_status_idx ON political_demands(organization_id, campaign_id, status);
CREATE INDEX political_demands_campaign_priority_idx ON political_demands(campaign_id, priority);
CREATE INDEX political_demands_leader_id_idx ON political_demands(leader_id);
CREATE INDEX political_demands_municipality_id_idx ON political_demands(municipality_id);
CREATE INDEX political_demands_electoral_zone_id_idx ON political_demands(electoral_zone_id);
CREATE INDEX political_demands_section_id_idx ON political_demands(section_id);
CREATE INDEX political_demands_neighborhood_id_idx ON political_demands(neighborhood_id);

CREATE INDEX operation_plans_org_campaign_status_idx ON operation_plans(organization_id, campaign_id, status);
CREATE INDEX operation_plans_campaign_created_at_idx ON operation_plans(campaign_id, created_at DESC);
CREATE INDEX operation_plans_target_candidate_id_idx ON operation_plans(target_candidate_id);
CREATE INDEX operation_plans_target_office_id_idx ON operation_plans(target_office_id);
CREATE INDEX operation_plan_allocations_plan_priority_idx ON operation_plan_allocations(plan_id, priority_score DESC);
CREATE INDEX operation_plan_allocations_municipality_id_idx ON operation_plan_allocations(municipality_id);
CREATE INDEX operation_plan_allocations_electoral_zone_id_idx ON operation_plan_allocations(electoral_zone_id);
CREATE INDEX operation_plan_allocations_section_id_idx ON operation_plan_allocations(section_id);
CREATE INDEX operation_plan_allocations_neighborhood_id_idx ON operation_plan_allocations(neighborhood_id);

CREATE INDEX strategic_insights_org_campaign_severity_idx ON strategic_insights(organization_id, campaign_id, severity);
CREATE INDEX strategic_insights_campaign_type_idx ON strategic_insights(campaign_id, type);
CREATE INDEX strategic_insights_candidate_id_idx ON strategic_insights(candidate_id);
CREATE INDEX strategic_insights_municipality_id_idx ON strategic_insights(municipality_id);
CREATE INDEX strategic_insights_electoral_zone_id_idx ON strategic_insights(electoral_zone_id);
CREATE INDEX strategic_insights_section_id_idx ON strategic_insights(section_id);
CREATE INDEX strategic_insights_neighborhood_id_idx ON strategic_insights(neighborhood_id);

CREATE TRIGGER political_leaders_updated_at BEFORE UPDATE ON political_leaders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER political_supporters_updated_at BEFORE UPDATE ON political_supporters FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER field_visits_updated_at BEFORE UPDATE ON field_visits FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER political_events_updated_at BEFORE UPDATE ON political_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER political_demands_updated_at BEFORE UPDATE ON political_demands FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER operation_plans_updated_at BEFORE UPDATE ON operation_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
