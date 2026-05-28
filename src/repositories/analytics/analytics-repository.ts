import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/utils";

export type TerritoryLevelInput = "STATE" | "METROPOLITAN_REGION" | "MUNICIPALITY" | "NEIGHBORHOOD" | "ZONE" | "SECTION";

export async function assertCampaignAccess(campaignId: string, organizationId: string) {
  const campaign = await getPrisma().campaign.findFirst({
    where: { id: campaignId, organizationId },
    select: { id: true }
  });

  if (!campaign) {
    throw new Error("Campanha invalida para esta organizacao.");
  }
}

export async function getAnalyticsFilters(campaignId: string) {
  const prisma = getPrisma();

  const [elections, offices, municipalities, zones, neighborhoods, candidates] = await Promise.all([
    prisma.territorialVoteSummary.findMany({
      where: { campaignId },
      distinct: ["electionYear", "electionCode", "round"],
      select: { electionYear: true, electionCode: true, round: true },
      orderBy: [{ electionYear: "desc" }, { round: "asc" }]
    }),
    prisma.electoralOffice.findMany({
      where: { voteSummaries: { some: { campaignId } } },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" }
    }),
    prisma.municipality.findMany({
      where: { voteSummaries: { some: { campaignId, territoryLevel: "MUNICIPALITY" } } },
      select: { id: true, tseCode: true, ibgeCode: true, name: true, region: true, isPriority: true },
      orderBy: [{ isPriority: "desc" }, { name: "asc" }]
    }),
    prisma.electoralZone.findMany({
      where: { voteSummaries: { some: { campaignId, territoryLevel: "ZONE" } } },
      select: {
        id: true,
        number: true,
        municipality: { select: { id: true, name: true, tseCode: true } }
      },
      orderBy: [{ municipality: { name: "asc" } }, { number: "asc" }]
    }),
    prisma.neighborhood.findMany({
      where: { voteSummaries: { some: { campaignId, territoryLevel: "NEIGHBORHOOD" } } },
      select: {
        id: true,
        name: true,
        municipality: { select: { id: true, name: true, tseCode: true } }
      },
      orderBy: [{ municipality: { name: "asc" } }, { name: "asc" }]
    }),
    prisma.candidate.findMany({
      where: { voteSummaries: { some: { campaignId } } },
      select: {
        id: true,
        name: true,
        ballotNumber: true,
        kind: true,
        office: { select: { id: true, code: true, name: true } },
        party: { select: { id: true, acronym: true, number: true } }
      },
      take: 500,
      orderBy: [{ kind: "asc" }, { name: "asc" }]
    })
  ]);

  return { elections, offices, municipalities, zones, neighborhoods, candidates };
}

function territoryIdColumn(level: TerritoryLevelInput) {
  switch (level) {
    case "STATE":
    case "METROPOLITAN_REGION":
      return Prisma.sql`tvs.territorial_region_id`;
    case "MUNICIPALITY":
      return Prisma.sql`tvs.municipality_id`;
    case "ZONE":
      return Prisma.sql`tvs.electoral_zone_id`;
    case "SECTION":
      return Prisma.sql`tvs.section_id`;
    case "NEIGHBORHOOD":
      return Prisma.sql`tvs.neighborhood_id`;
  }
}

function territoryNameExpression(level: TerritoryLevelInput) {
  switch (level) {
    case "STATE":
    case "METROPOLITAN_REGION":
      return Prisma.sql`tr.name`;
    case "MUNICIPALITY":
      return Prisma.sql`m.name`;
    case "ZONE":
      return Prisma.sql`m.name || ' - Zona ' || z.number::text`;
    case "SECTION":
      return Prisma.sql`m.name || ' - Zona ' || z.number::text || ' - Secao ' || s.number::text`;
    case "NEIGHBORHOOD":
      return Prisma.sql`m.name || ' - ' || n.name`;
  }
}

export async function getTerritoryStats(input: {
  campaignId: string;
  territoryLevel: TerritoryLevelInput;
  electionYear?: number;
  round?: number;
  officeId?: string;
  candidateId?: string;
  municipalityId?: string;
  limit: number;
}) {
  const territoryId = territoryIdColumn(input.territoryLevel);
  const territoryName = territoryNameExpression(input.territoryLevel);

  return getPrisma().$queryRaw<
    Array<{
      territory_id: string;
      territory_name: string;
      candidate_id: string;
      candidate_name: string;
      ballot_number: number;
      party_acronym: string | null;
      office_name: string | null;
      votes: number;
      total_votes: number;
      vote_share: string | null;
    }>
  >(
    Prisma.sql`
      SELECT
        ${territoryId}::text AS territory_id,
        ${territoryName} AS territory_name,
        c.id::text AS candidate_id,
        c.name AS candidate_name,
        c.ballot_number,
        p.acronym AS party_acronym,
        o.name AS office_name,
        tvs.votes,
        tvs.total_votes,
        tvs.vote_share::text
      FROM territorial_vote_summaries tvs
      JOIN candidates c ON c.id = tvs.candidate_id
      LEFT JOIN parties p ON p.id = tvs.party_id
      LEFT JOIN electoral_offices o ON o.id = tvs.office_id
      LEFT JOIN municipalities m ON m.id = tvs.municipality_id
      LEFT JOIN electoral_zones z ON z.id = tvs.electoral_zone_id
      LEFT JOIN electoral_sections s ON s.id = tvs.section_id
      LEFT JOIN neighborhoods n ON n.id = tvs.neighborhood_id
      LEFT JOIN territorial_regions tr ON tr.id = tvs.territorial_region_id
      WHERE tvs.campaign_id = ${input.campaignId}::uuid
        AND tvs.territory_level = ${input.territoryLevel}::"TerritoryLevel"
        ${input.electionYear ? Prisma.sql`AND tvs.election_year = ${input.electionYear}` : Prisma.empty}
        ${input.round ? Prisma.sql`AND tvs.round = ${input.round}` : Prisma.empty}
        ${input.officeId ? Prisma.sql`AND tvs.office_id = ${input.officeId}::uuid` : Prisma.empty}
        ${input.candidateId ? Prisma.sql`AND tvs.candidate_id = ${input.candidateId}::uuid` : Prisma.empty}
        ${input.municipalityId ? Prisma.sql`AND tvs.municipality_id = ${input.municipalityId}::uuid` : Prisma.empty}
      ORDER BY tvs.votes DESC
      LIMIT ${input.limit}
    `
  );
}

export async function searchAnalyticsEntities(input: {
  campaignId: string;
  query: string;
  type: "municipality" | "zone" | "section" | "neighborhood" | "candidate";
  limit: number;
}) {
  const normalized = normalizeText(input.query);
  const contains = `%${normalized}%`;
  const prisma = getPrisma();

  if (input.type === "candidate") {
    return prisma.candidate.findMany({
      where: {
        normalizedName: { contains: normalized },
        voteSummaries: { some: { campaignId: input.campaignId } }
      },
      select: { id: true, name: true, ballotNumber: true, kind: true, party: { select: { acronym: true, number: true } } },
      take: input.limit,
      orderBy: { name: "asc" }
    });
  }

  if (input.type === "municipality") {
    return prisma.$queryRaw`
      SELECT DISTINCT m.id::text, m.name, m.tse_code, m.region, m.is_priority
      FROM municipalities m
      JOIN territorial_vote_summaries tvs ON tvs.municipality_id = m.id
      WHERE tvs.campaign_id = ${input.campaignId}::uuid
        AND m.normalized LIKE ${contains}
      ORDER BY m.is_priority DESC, m.name ASC
      LIMIT ${input.limit}
    `;
  }

  if (input.type === "zone") {
    return prisma.$queryRaw`
      SELECT DISTINCT z.id::text, z.number, m.name AS municipality_name, m.tse_code
      FROM electoral_zones z
      JOIN municipalities m ON m.id = z.municipality_id
      JOIN territorial_vote_summaries tvs ON tvs.electoral_zone_id = z.id
      WHERE tvs.campaign_id = ${input.campaignId}::uuid
        AND (m.normalized LIKE ${contains} OR z.number::text LIKE ${input.query})
      ORDER BY m.name ASC, z.number ASC
      LIMIT ${input.limit}
    `;
  }

  if (input.type === "section") {
    return prisma.$queryRaw`
      SELECT DISTINCT s.id::text, s.number, s.voting_place_name, z.number AS zone_number, m.name AS municipality_name
      FROM electoral_sections s
      JOIN electoral_zones z ON z.id = s.electoral_zone_id
      JOIN municipalities m ON m.id = s.municipality_id
      JOIN territorial_vote_summaries tvs ON tvs.section_id = s.id
      WHERE tvs.campaign_id = ${input.campaignId}::uuid
        AND (m.normalized LIKE ${contains} OR s.number::text LIKE ${input.query} OR s.voting_place_name ILIKE ${`%${input.query}%`})
      ORDER BY m.name ASC, z.number ASC, s.number ASC
      LIMIT ${input.limit}
    `;
  }

  return prisma.$queryRaw`
    SELECT DISTINCT n.id::text, n.name, m.name AS municipality_name, m.tse_code
    FROM neighborhoods n
    JOIN municipalities m ON m.id = n.municipality_id
    JOIN territorial_vote_summaries tvs ON tvs.neighborhood_id = n.id
    WHERE tvs.campaign_id = ${input.campaignId}::uuid
      AND n.normalized LIKE ${contains}
    ORDER BY m.name ASC, n.name ASC
    LIMIT ${input.limit}
  `;
}

export async function compareTerritories(input: {
  campaignId: string;
  territoryLevel: TerritoryLevelInput;
  leftId: string;
  rightId: string;
  officeId?: string;
  candidateId?: string;
  limit: number;
}) {
  const territoryId = territoryIdColumn(input.territoryLevel);

  return getPrisma().$queryRaw`
    WITH scoped AS (
      SELECT
        ${territoryId}::text AS territory_id,
        c.id::text AS candidate_id,
        c.name AS candidate_name,
        c.ballot_number,
        p.acronym AS party_acronym,
        tvs.votes,
        tvs.total_votes,
        tvs.vote_share
      FROM territorial_vote_summaries tvs
      JOIN candidates c ON c.id = tvs.candidate_id
      LEFT JOIN parties p ON p.id = tvs.party_id
      WHERE tvs.campaign_id = ${input.campaignId}::uuid
        AND tvs.territory_level = ${input.territoryLevel}::"TerritoryLevel"
        AND ${territoryId} IN (${input.leftId}::uuid, ${input.rightId}::uuid)
        ${input.officeId ? Prisma.sql`AND tvs.office_id = ${input.officeId}::uuid` : Prisma.empty}
        ${input.candidateId ? Prisma.sql`AND tvs.candidate_id = ${input.candidateId}::uuid` : Prisma.empty}
    ),
    left_side AS (
      SELECT * FROM scoped WHERE territory_id = ${input.leftId}
    ),
    right_side AS (
      SELECT * FROM scoped WHERE territory_id = ${input.rightId}
    )
    SELECT
      COALESCE(left_side.candidate_id, right_side.candidate_id) AS candidate_id,
      COALESCE(left_side.candidate_name, right_side.candidate_name) AS candidate_name,
      COALESCE(left_side.ballot_number, right_side.ballot_number) AS ballot_number,
      COALESCE(left_side.party_acronym, right_side.party_acronym) AS party_acronym,
      COALESCE(left_side.votes, 0) AS left_votes,
      COALESCE(right_side.votes, 0) AS right_votes,
      left_side.vote_share::text AS left_vote_share,
      right_side.vote_share::text AS right_vote_share,
      COALESCE(left_side.votes, 0) - COALESCE(right_side.votes, 0) AS vote_delta
    FROM left_side
    FULL OUTER JOIN right_side ON right_side.candidate_id = left_side.candidate_id
    ORDER BY ABS(COALESCE(left_side.votes, 0) - COALESCE(right_side.votes, 0)) DESC
    LIMIT ${input.limit}
  `;
}
