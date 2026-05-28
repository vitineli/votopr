import { Prisma, type TerritoryLevel } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { generateStrategicInsights } from "@/services/intelligence/insights";
import {
  buildAllocationSuggestions,
  calculateTerritoryScore,
  summarizePlan,
  type AllocationSuggestion,
  type OperationInput,
  type RawTerritoryMetrics
} from "@/services/intelligence/scoring";

export type IntelligenceLevel = Extract<TerritoryLevel, "MUNICIPALITY" | "NEIGHBORHOOD" | "ZONE" | "SECTION">;

export type IntelligenceInput = {
  campaignId: string;
  organizationId: string;
  territoryLevel: IntelligenceLevel;
  candidateId?: string;
  officeId?: string;
  electionYear?: number;
  round?: number;
  limit: number;
};

type MetricsRow = {
  territory_id: string;
  territory_name: string;
  territory_level: IntelligenceLevel;
  municipality_id: string | null;
  electoral_zone_id: string | null;
  section_id: string | null;
  neighborhood_id: string | null;
  total_votes: number;
  candidate_votes: number;
  candidate_share: string | null;
  top_competitor_votes: number;
  top_competitor_share: string | null;
  blank_null_votes: number;
  previous_votes: number | null;
  previous_share: string | null;
  leaders: number;
  supporters: number;
  visits_completed: number;
  visits_planned: number;
  open_demands: number;
  events: number;
};

function scopeIdSql(level: IntelligenceLevel, alias = "tvs") {
  switch (level) {
    case "MUNICIPALITY":
      return Prisma.raw(`${alias}.municipality_id`);
    case "NEIGHBORHOOD":
      return Prisma.raw(`${alias}.neighborhood_id`);
    case "ZONE":
      return Prisma.raw(`${alias}.electoral_zone_id`);
    case "SECTION":
      return Prisma.raw(`${alias}.section_id`);
  }
}

function crmScopeField(level: IntelligenceLevel, table: string) {
  switch (level) {
    case "MUNICIPALITY":
      return Prisma.raw(`${table}.municipality_id`);
    case "NEIGHBORHOOD":
      return Prisma.raw(`${table}.neighborhood_id`);
    case "ZONE":
      return Prisma.raw(`${table}.electoral_zone_id`);
    case "SECTION":
      return Prisma.raw(`${table}.section_id`);
  }
}

function territoryNameSql(level: IntelligenceLevel) {
  switch (level) {
    case "MUNICIPALITY":
      return Prisma.sql`m.name`;
    case "NEIGHBORHOOD":
      return Prisma.sql`n.name || ' - ' || m.name`;
    case "ZONE":
      return Prisma.sql`m.name || ' - Zona ' || z.number::text`;
    case "SECTION":
      return Prisma.sql`m.name || ' - Zona ' || z.number::text || ' - Secao ' || s.number::text`;
  }
}

function territoryJoinsSql(level: IntelligenceLevel) {
  switch (level) {
    case "MUNICIPALITY":
      return Prisma.sql`JOIN municipalities m ON m.id = base.scope_id`;
    case "NEIGHBORHOOD":
      return Prisma.sql`
        JOIN neighborhoods n ON n.id = base.scope_id
        JOIN municipalities m ON m.id = n.municipality_id
      `;
    case "ZONE":
      return Prisma.sql`
        JOIN electoral_zones z ON z.id = base.scope_id
        JOIN municipalities m ON m.id = z.municipality_id
      `;
    case "SECTION":
      return Prisma.sql`
        JOIN electoral_sections s ON s.id = base.scope_id
        JOIN electoral_zones z ON z.id = s.electoral_zone_id
        JOIN municipalities m ON m.id = s.municipality_id
      `;
  }
}

function territoryIdsSql(level: IntelligenceLevel) {
  switch (level) {
    case "MUNICIPALITY":
      return Prisma.sql`
        base.scope_id AS municipality_id,
        NULL::uuid AS electoral_zone_id,
        NULL::uuid AS section_id,
        NULL::uuid AS neighborhood_id
      `;
    case "NEIGHBORHOOD":
      return Prisma.sql`
        m.id AS municipality_id,
        NULL::uuid AS electoral_zone_id,
        NULL::uuid AS section_id,
        base.scope_id AS neighborhood_id
      `;
    case "ZONE":
      return Prisma.sql`
        m.id AS municipality_id,
        base.scope_id AS electoral_zone_id,
        NULL::uuid AS section_id,
        NULL::uuid AS neighborhood_id
      `;
    case "SECTION":
      return Prisma.sql`
        m.id AS municipality_id,
        z.id AS electoral_zone_id,
        base.scope_id AS section_id,
        s.neighborhood_id AS neighborhood_id
      `;
  }
}

async function getLatestElection(campaignId: string) {
  return getPrisma().territorialVoteSummary.findFirst({
    where: { campaignId },
    orderBy: [{ electionYear: "desc" }, { round: "desc" }],
    select: { electionYear: true, round: true }
  });
}

export async function getTerritorialScores(input: IntelligenceInput) {
  const latest = await getLatestElection(input.campaignId);
  const electionYear = input.electionYear ?? latest?.electionYear;
  const round = input.round ?? latest?.round;
  const scopeId = scopeIdSql(input.territoryLevel);
  const nameSql = territoryNameSql(input.territoryLevel);
  const joinsSql = territoryJoinsSql(input.territoryLevel);
  const idsSql = territoryIdsSql(input.territoryLevel);
  const leaderScope = crmScopeField(input.territoryLevel, "pl");
  const supporterScope = crmScopeField(input.territoryLevel, "ps");
  const visitScope = crmScopeField(input.territoryLevel, "fv");
  const demandScope = crmScopeField(input.territoryLevel, "pd");
  const eventScope = crmScopeField(input.territoryLevel, "pe");

  const rows = await getPrisma().$queryRaw<MetricsRow[]>(
    Prisma.sql`
      WITH base AS (
        SELECT
          ${scopeId} AS scope_id,
          MAX(tvs.total_votes)::integer AS total_votes
        FROM territorial_vote_summaries tvs
        WHERE tvs.campaign_id = ${input.campaignId}::uuid
          AND tvs.territory_level = ${input.territoryLevel}::"TerritoryLevel"
          AND ${scopeId} IS NOT NULL
          ${electionYear ? Prisma.sql`AND tvs.election_year = ${electionYear}` : Prisma.empty}
          ${round ? Prisma.sql`AND tvs.round = ${round}` : Prisma.empty}
          ${input.officeId ? Prisma.sql`AND tvs.office_id = ${input.officeId}::uuid` : Prisma.empty}
        GROUP BY ${scopeId}
      ),
      target AS (
        SELECT
          ${scopeId} AS scope_id,
          SUM(tvs.votes)::integer AS candidate_votes,
          CASE WHEN MAX(tvs.total_votes) > 0 THEN ROUND(SUM(tvs.votes)::numeric / MAX(tvs.total_votes)::numeric * 100, 5) ELSE 0 END AS candidate_share
        FROM territorial_vote_summaries tvs
        WHERE tvs.campaign_id = ${input.campaignId}::uuid
          AND tvs.territory_level = ${input.territoryLevel}::"TerritoryLevel"
          ${input.candidateId ? Prisma.sql`AND tvs.candidate_id = ${input.candidateId}::uuid` : Prisma.sql`AND FALSE`}
          ${electionYear ? Prisma.sql`AND tvs.election_year = ${electionYear}` : Prisma.empty}
          ${round ? Prisma.sql`AND tvs.round = ${round}` : Prisma.empty}
          ${input.officeId ? Prisma.sql`AND tvs.office_id = ${input.officeId}::uuid` : Prisma.empty}
        GROUP BY ${scopeId}
      ),
      competitors AS (
        SELECT DISTINCT ON (${scopeId})
          ${scopeId} AS scope_id,
          tvs.votes AS top_competitor_votes,
          tvs.vote_share AS top_competitor_share
        FROM territorial_vote_summaries tvs
        JOIN candidates c ON c.id = tvs.candidate_id
        WHERE tvs.campaign_id = ${input.campaignId}::uuid
          AND tvs.territory_level = ${input.territoryLevel}::"TerritoryLevel"
          AND c.kind = 'CANDIDATE'
          ${input.candidateId ? Prisma.sql`AND tvs.candidate_id <> ${input.candidateId}::uuid` : Prisma.empty}
          ${electionYear ? Prisma.sql`AND tvs.election_year = ${electionYear}` : Prisma.empty}
          ${round ? Prisma.sql`AND tvs.round = ${round}` : Prisma.empty}
          ${input.officeId ? Prisma.sql`AND tvs.office_id = ${input.officeId}::uuid` : Prisma.empty}
        ORDER BY ${scopeId}, tvs.votes DESC
      ),
      orphan_votes AS (
        SELECT
          ${scopeId} AS scope_id,
          SUM(tvs.votes)::integer AS blank_null_votes
        FROM territorial_vote_summaries tvs
        JOIN candidates c ON c.id = tvs.candidate_id
        WHERE tvs.campaign_id = ${input.campaignId}::uuid
          AND tvs.territory_level = ${input.territoryLevel}::"TerritoryLevel"
          AND c.kind IN ('BLANK', 'NULL', 'OTHER')
          ${electionYear ? Prisma.sql`AND tvs.election_year = ${electionYear}` : Prisma.empty}
          ${round ? Prisma.sql`AND tvs.round = ${round}` : Prisma.empty}
          ${input.officeId ? Prisma.sql`AND tvs.office_id = ${input.officeId}::uuid` : Prisma.empty}
        GROUP BY ${scopeId}
      ),
      previous AS (
        SELECT
          ${scopeId} AS scope_id,
          SUM(tvs.votes)::integer AS previous_votes,
          CASE WHEN MAX(tvs.total_votes) > 0 THEN ROUND(SUM(tvs.votes)::numeric / MAX(tvs.total_votes)::numeric * 100, 5) ELSE NULL END AS previous_share
        FROM territorial_vote_summaries tvs
        WHERE ${input.candidateId && electionYear ? Prisma.sql`tvs.candidate_id = ${input.candidateId}::uuid AND tvs.election_year = ${electionYear - 4}` : Prisma.sql`FALSE`}
          AND tvs.campaign_id = ${input.campaignId}::uuid
          AND tvs.territory_level = ${input.territoryLevel}::"TerritoryLevel"
          ${round ? Prisma.sql`AND tvs.round = ${round}` : Prisma.empty}
          ${input.officeId ? Prisma.sql`AND tvs.office_id = ${input.officeId}::uuid` : Prisma.empty}
        GROUP BY ${scopeId}
      ),
      leaders AS (
        SELECT ${leaderScope} AS scope_id, COUNT(*)::integer AS leaders
        FROM political_leaders pl
        WHERE pl.campaign_id = ${input.campaignId}::uuid AND ${leaderScope} IS NOT NULL
        GROUP BY ${leaderScope}
      ),
      supporters AS (
        SELECT ${supporterScope} AS scope_id, COUNT(*)::integer AS supporters
        FROM political_supporters ps
        WHERE ps.campaign_id = ${input.campaignId}::uuid AND ps.status IN ('SUPPORTER', 'ACTIVE') AND ${supporterScope} IS NOT NULL
        GROUP BY ${supporterScope}
      ),
      visits AS (
        SELECT
          ${visitScope} AS scope_id,
          COUNT(*) FILTER (WHERE fv.status = 'COMPLETED')::integer AS visits_completed,
          COUNT(*) FILTER (WHERE fv.status IN ('PLANNED', 'IN_PROGRESS'))::integer AS visits_planned
        FROM field_visits fv
        WHERE fv.campaign_id = ${input.campaignId}::uuid AND ${visitScope} IS NOT NULL
        GROUP BY ${visitScope}
      ),
      demands AS (
        SELECT ${demandScope} AS scope_id, COUNT(*)::integer AS open_demands
        FROM political_demands pd
        WHERE pd.campaign_id = ${input.campaignId}::uuid AND pd.status IN ('OPEN', 'TRIAGED', 'IN_PROGRESS') AND ${demandScope} IS NOT NULL
        GROUP BY ${demandScope}
      ),
      events AS (
        SELECT ${eventScope} AS scope_id, COUNT(*)::integer AS events
        FROM political_events pe
        WHERE pe.campaign_id = ${input.campaignId}::uuid AND pe.status IN ('CONFIRMED', 'COMPLETED') AND ${eventScope} IS NOT NULL
        GROUP BY ${eventScope}
      )
      SELECT
        base.scope_id::text AS territory_id,
        ${nameSql} AS territory_name,
        ${input.territoryLevel}::text AS territory_level,
        ${idsSql},
        COALESCE(base.total_votes, 0) AS total_votes,
        COALESCE(target.candidate_votes, 0) AS candidate_votes,
        COALESCE(target.candidate_share, 0)::text AS candidate_share,
        COALESCE(competitors.top_competitor_votes, 0) AS top_competitor_votes,
        COALESCE(competitors.top_competitor_share, 0)::text AS top_competitor_share,
        COALESCE(orphan_votes.blank_null_votes, 0) AS blank_null_votes,
        previous.previous_votes,
        previous.previous_share::text,
        COALESCE(leaders.leaders, 0) AS leaders,
        COALESCE(supporters.supporters, 0) AS supporters,
        COALESCE(visits.visits_completed, 0) AS visits_completed,
        COALESCE(visits.visits_planned, 0) AS visits_planned,
        COALESCE(demands.open_demands, 0) AS open_demands,
        COALESCE(events.events, 0) AS events
      FROM base
      ${joinsSql}
      LEFT JOIN target ON target.scope_id = base.scope_id
      LEFT JOIN competitors ON competitors.scope_id = base.scope_id
      LEFT JOIN orphan_votes ON orphan_votes.scope_id = base.scope_id
      LEFT JOIN previous ON previous.scope_id = base.scope_id
      LEFT JOIN leaders ON leaders.scope_id = base.scope_id
      LEFT JOIN supporters ON supporters.scope_id = base.scope_id
      LEFT JOIN visits ON visits.scope_id = base.scope_id
      LEFT JOIN demands ON demands.scope_id = base.scope_id
      LEFT JOIN events ON events.scope_id = base.scope_id
      ORDER BY base.total_votes DESC
      LIMIT ${input.limit}
    `
  );

  const rawMetrics: RawTerritoryMetrics[] = rows.map((row) => ({
    territoryId: row.territory_id,
    territoryName: row.territory_name,
    territoryLevel: row.territory_level,
    municipalityId: row.municipality_id,
    electoralZoneId: row.electoral_zone_id,
    sectionId: row.section_id,
    neighborhoodId: row.neighborhood_id,
    totalVotes: row.total_votes,
    candidateVotes: row.candidate_votes,
    candidateShare: Number(row.candidate_share ?? 0),
    topCompetitorVotes: row.top_competitor_votes,
    topCompetitorShare: Number(row.top_competitor_share ?? 0),
    blankNullVotes: row.blank_null_votes,
    previousVotes: row.previous_votes,
    previousShare: row.previous_share === null ? null : Number(row.previous_share),
    leaders: row.leaders,
    supporters: row.supporters,
    visitsCompleted: row.visits_completed,
    visitsPlanned: row.visits_planned,
    openDemands: row.open_demands,
    events: row.events
  }));

  return rawMetrics
    .map(calculateTerritoryScore)
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

export async function getPoliticalIntelligenceOverview(input: IntelligenceInput) {
  const scores = await getTerritorialScores(input);
  const insights = generateStrategicInsights(scores);
  const totals = scores.reduce(
    (acc, score) => ({
      totalVotes: acc.totalVotes + score.totalVotes,
      candidateVotes: acc.candidateVotes + score.candidateVotes,
      potentialVotes: acc.potentialVotes + score.potentialVotes,
      orphanVotes: acc.orphanVotes + score.orphanVotes,
      leaders: acc.leaders + score.leaders,
      supporters: acc.supporters + score.supporters,
      visitsCompleted: acc.visitsCompleted + score.visitsCompleted,
      openDemands: acc.openDemands + score.openDemands
    }),
    {
      totalVotes: 0,
      candidateVotes: 0,
      potentialVotes: 0,
      orphanVotes: 0,
      leaders: 0,
      supporters: 0,
      visitsCompleted: 0,
      openDemands: 0
    }
  );

  return {
    kpis: {
      territories: scores.length,
      averagePriority: scores.length ? Math.round(scores.reduce((sum, score) => sum + score.priorityScore, 0) / scores.length) : 0,
      neglectedTerritories: scores.filter((score) => score.neglected).length,
      opportunityVotes: totals.potentialVotes,
      orphanVotes: totals.orphanVotes,
      leaders: totals.leaders,
      supporters: totals.supporters,
      visitsCompleted: totals.visitsCompleted,
      openDemands: totals.openDemands
    },
    scores,
    insights
  };
}

export async function createOperationPlan(input: IntelligenceInput & OperationInput & {
  userId: string;
  name?: string;
}) {
  const scores = await getTerritorialScores({ ...input, limit: 200 });
  const allocations = buildAllocationSuggestions(scores, input);
  const totals = summarizePlan(allocations, input);
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const plan = await tx.operationPlan.create({
      data: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        createdById: input.userId,
        targetCandidateId: input.candidateId,
        targetOfficeId: input.officeId,
        name: input.name ?? `Plano de rua ${new Date().toLocaleDateString("pt-BR")}`,
        territoryLevel: input.territoryLevel,
        targetVotes: input.targetVotes,
        fieldWorkers: input.fieldWorkers,
        vehicles: input.vehicles,
        budget: new Prisma.Decimal(input.budget),
        totals
      }
    });

    if (allocations.length > 0) {
      await tx.operationPlanAllocation.createMany({
        data: allocations.map((allocation: AllocationSuggestion) => ({
          planId: plan.id,
          territoryLevel: allocation.territoryLevel,
          municipalityId: allocation.municipalityId,
          electoralZoneId: allocation.electoralZoneId,
          sectionId: allocation.sectionId,
          neighborhoodId: allocation.neighborhoodId,
          territoryName: allocation.territoryName,
          priorityScore: new Prisma.Decimal(allocation.priorityScore),
          potentialScore: new Prisma.Decimal(allocation.potentialScore),
          difficultyScore: new Prisma.Decimal(allocation.difficultyScore),
          competitionScore: new Prisma.Decimal(allocation.competitionScore),
          opportunityScore: new Prisma.Decimal(allocation.opportunityScore),
          potentialVotes: allocation.potentialVotes,
          orphanVotes: allocation.orphanVotes,
          fieldWorkers: allocation.allocatedWorkers,
          vehicles: allocation.allocatedVehicles,
          budget: new Prisma.Decimal(allocation.allocatedBudget),
          expectedVotes: allocation.expectedVotes,
          costPerExpectedVote: allocation.costPerExpectedVote === null ? null : new Prisma.Decimal(allocation.costPerExpectedVote),
          rationale: allocation.rationale
        }))
      });
    }

    return tx.operationPlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: {
        allocations: {
          orderBy: { priorityScore: "desc" },
          take: 30
        }
      }
    });
  });
}
