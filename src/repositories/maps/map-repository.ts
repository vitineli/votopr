import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { TerritoryLevelInput } from "@/repositories/analytics/analytics-repository";

export type MapLayerLevel = Extract<TerritoryLevelInput, "MUNICIPALITY" | "NEIGHBORHOOD" | "ZONE" | "SECTION">;

export type MapGeoJsonFilters = {
  campaignId: string;
  level: MapLayerLevel;
  electionYear?: number;
  round?: number;
  officeId?: string;
  candidateId?: string;
  compareCandidateId?: string;
  partyId?: string;
  municipalityId?: string;
  neighborhoodId?: string;
  zoneId?: string;
  sectionId?: string;
  limit: number;
};

type MapFeatureRow = {
  id: string;
  name: string;
  level: MapLayerLevel;
  municipality_name: string | null;
  zone_number: number | null;
  section_number: number | null;
  votes: number;
  total_votes: number;
  vote_share: string | null;
  compare_votes: number | null;
  compare_vote_share: string | null;
  share_delta: string | null;
  previous_votes: number | null;
  previous_vote_share: string | null;
  growth_votes: number | null;
  growth_share_delta: string | null;
  dominant_candidate_id: string | null;
  dominant_candidate_name: string | null;
  dominant_party: string | null;
  dominant_votes: number | null;
  dominant_vote_share: string | null;
  potential_votes: number;
  geometry: string;
};

type BoundsRow = {
  west: number | null;
  south: number | null;
  east: number | null;
  north: number | null;
};

function scopeIdSql(level: MapLayerLevel) {
  switch (level) {
    case "MUNICIPALITY":
      return Prisma.sql`tvs.municipality_id`;
    case "NEIGHBORHOOD":
      return Prisma.sql`tvs.neighborhood_id`;
    case "ZONE":
      return Prisma.sql`tvs.electoral_zone_id`;
    case "SECTION":
      return Prisma.sql`tvs.section_id`;
  }
}

function scopeJoinSql(level: MapLayerLevel) {
  switch (level) {
    case "MUNICIPALITY":
      return Prisma.sql`
        JOIN municipalities geom_m ON geom_m.id = scoped.scope_id
      `;
    case "NEIGHBORHOOD":
      return Prisma.sql`
        JOIN neighborhoods n ON n.id = scoped.scope_id
        JOIN municipalities geom_m ON geom_m.id = n.municipality_id
      `;
    case "ZONE":
      return Prisma.sql`
        JOIN electoral_zones z ON z.id = scoped.scope_id
        JOIN municipalities geom_m ON geom_m.id = z.municipality_id
      `;
    case "SECTION":
      return Prisma.sql`
        JOIN electoral_sections s ON s.id = scoped.scope_id
        JOIN municipalities geom_m ON geom_m.id = s.municipality_id
      `;
  }
}

function geometrySql(level: MapLayerLevel) {
  switch (level) {
    case "MUNICIPALITY":
      return Prisma.sql`geom_m.boundary`;
    case "NEIGHBORHOOD":
      return Prisma.sql`n.boundary`;
    case "ZONE":
      return Prisma.sql`z.boundary`;
    case "SECTION":
      return Prisma.sql`s.geom`;
  }
}

function territoryNameSql(level: MapLayerLevel) {
  switch (level) {
    case "MUNICIPALITY":
      return Prisma.sql`geom_m.name`;
    case "NEIGHBORHOOD":
      return Prisma.sql`n.name`;
    case "ZONE":
      return Prisma.sql`'Zona ' || z.number::text`;
    case "SECTION":
      return Prisma.sql`'Secao ' || s.number::text || ' - ' || s.voting_place_name`;
  }
}

function extraSelectSql(level: MapLayerLevel) {
  switch (level) {
    case "MUNICIPALITY":
      return Prisma.sql`
        geom_m.name AS municipality_name,
        NULL::integer AS zone_number,
        NULL::integer AS section_number
      `;
    case "NEIGHBORHOOD":
      return Prisma.sql`
        geom_m.name AS municipality_name,
        NULL::integer AS zone_number,
        NULL::integer AS section_number
      `;
    case "ZONE":
      return Prisma.sql`
        geom_m.name AS municipality_name,
        z.number AS zone_number,
        NULL::integer AS section_number
      `;
    case "SECTION":
      return Prisma.sql`
        geom_m.name AS municipality_name,
        z.number AS zone_number,
        s.number AS section_number
      `;
  }
}

function extraJoinForSectionSql(level: MapLayerLevel) {
  return level === "SECTION" ? Prisma.sql`JOIN electoral_zones z ON z.id = s.electoral_zone_id` : Prisma.empty;
}

export function toFeatureCollection(rows: MapFeatureRow[], filters: MapGeoJsonFilters, bounds?: BoundsRow) {
  const maxVotes = Math.max(...rows.map((row) => row.votes), 0);

  return {
    type: "FeatureCollection",
    metadata: {
      campaignId: filters.campaignId,
      level: filters.level,
      filters,
      bounds,
      maxVotes,
      generatedAt: new Date().toISOString(),
      emptyReason: rows.length === 0 ? "Sem geometrias reais carregadas para este recorte." : null
    },
    features: rows.map((row) => ({
      type: "Feature",
      id: row.id,
      geometry: JSON.parse(row.geometry),
      properties: {
        id: row.id,
        level: row.level,
        name: row.name,
        municipalityName: row.municipality_name,
        zoneNumber: row.zone_number,
        sectionNumber: row.section_number,
        votes: row.votes,
        totalVotes: row.total_votes,
        voteShare: row.vote_share ? Number(row.vote_share) : null,
        compareVotes: row.compare_votes,
        compareVoteShare: row.compare_vote_share ? Number(row.compare_vote_share) : null,
        shareDelta: row.share_delta ? Number(row.share_delta) : null,
        previousVotes: row.previous_votes,
        previousVoteShare: row.previous_vote_share ? Number(row.previous_vote_share) : null,
        growthVotes: row.growth_votes,
        growthShareDelta: row.growth_share_delta ? Number(row.growth_share_delta) : null,
        dominantCandidateId: row.dominant_candidate_id,
        dominantCandidateName: row.dominant_candidate_name,
        dominantParty: row.dominant_party,
        dominantVotes: row.dominant_votes,
        dominantVoteShare: row.dominant_vote_share ? Number(row.dominant_vote_share) : null,
        potentialVotes: row.potential_votes,
        intensity: maxVotes > 0 ? Number((row.votes / maxVotes).toFixed(6)) : 0
      }
    }))
  };
}

export async function getMapGeoJsonRows(filters: MapGeoJsonFilters) {
  const scopeId = scopeIdSql(filters.level);
  const scopeJoin = scopeJoinSql(filters.level);
  const geometry = geometrySql(filters.level);
  const territoryName = territoryNameSql(filters.level);
  const extraSelect = extraSelectSql(filters.level);
  const extraJoinForSection = extraJoinForSectionSql(filters.level);

  const rows = await getPrisma().$queryRaw<MapFeatureRow[]>(
    Prisma.sql`
      WITH selected AS (
        SELECT
          ${scopeId} AS scope_id,
          tvs.candidate_id,
          tvs.votes,
          tvs.total_votes,
          tvs.vote_share,
          tvs.election_year,
          tvs.round,
          tvs.office_id,
          tvs.party_id
        FROM territorial_vote_summaries tvs
        WHERE tvs.campaign_id = ${filters.campaignId}::uuid
          AND tvs.territory_level = ${filters.level}::"TerritoryLevel"
          ${filters.electionYear ? Prisma.sql`AND tvs.election_year = ${filters.electionYear}` : Prisma.empty}
          ${filters.round ? Prisma.sql`AND tvs.round = ${filters.round}` : Prisma.empty}
          ${filters.officeId ? Prisma.sql`AND tvs.office_id = ${filters.officeId}::uuid` : Prisma.empty}
          ${filters.partyId ? Prisma.sql`AND tvs.party_id = ${filters.partyId}::uuid` : Prisma.empty}
          ${filters.candidateId ? Prisma.sql`AND tvs.candidate_id = ${filters.candidateId}::uuid` : Prisma.empty}
          ${filters.municipalityId ? Prisma.sql`AND tvs.municipality_id = ${filters.municipalityId}::uuid` : Prisma.empty}
          ${filters.neighborhoodId ? Prisma.sql`AND tvs.neighborhood_id = ${filters.neighborhoodId}::uuid` : Prisma.empty}
          ${filters.zoneId ? Prisma.sql`AND tvs.electoral_zone_id = ${filters.zoneId}::uuid` : Prisma.empty}
          ${filters.sectionId ? Prisma.sql`AND tvs.section_id = ${filters.sectionId}::uuid` : Prisma.empty}
      ),
      compare_selected AS (
        SELECT
          ${scopeId} AS scope_id,
          tvs.votes,
          tvs.vote_share
        FROM territorial_vote_summaries tvs
        WHERE ${filters.compareCandidateId ? Prisma.sql`tvs.candidate_id = ${filters.compareCandidateId}::uuid` : Prisma.sql`FALSE`}
          AND tvs.campaign_id = ${filters.campaignId}::uuid
          AND tvs.territory_level = ${filters.level}::"TerritoryLevel"
          ${filters.electionYear ? Prisma.sql`AND tvs.election_year = ${filters.electionYear}` : Prisma.empty}
          ${filters.round ? Prisma.sql`AND tvs.round = ${filters.round}` : Prisma.empty}
          ${filters.officeId ? Prisma.sql`AND tvs.office_id = ${filters.officeId}::uuid` : Prisma.empty}
      ),
      previous_selected AS (
        SELECT
          ${scopeId} AS scope_id,
          tvs.votes,
          tvs.vote_share
        FROM territorial_vote_summaries tvs
        WHERE ${filters.candidateId && filters.electionYear ? Prisma.sql`tvs.candidate_id = ${filters.candidateId}::uuid AND tvs.election_year = ${filters.electionYear - 4}` : Prisma.sql`FALSE`}
          AND tvs.campaign_id = ${filters.campaignId}::uuid
          AND tvs.territory_level = ${filters.level}::"TerritoryLevel"
          ${filters.round ? Prisma.sql`AND tvs.round = ${filters.round}` : Prisma.empty}
          ${filters.officeId ? Prisma.sql`AND tvs.office_id = ${filters.officeId}::uuid` : Prisma.empty}
      ),
      dominant AS (
        SELECT DISTINCT ON (${scopeId})
          ${scopeId} AS scope_id,
          c.id AS candidate_id,
          c.name AS candidate_name,
          p.acronym AS party_acronym,
          tvs.votes,
          tvs.vote_share
        FROM territorial_vote_summaries tvs
        JOIN candidates c ON c.id = tvs.candidate_id
        LEFT JOIN parties p ON p.id = tvs.party_id
        WHERE tvs.campaign_id = ${filters.campaignId}::uuid
          AND tvs.territory_level = ${filters.level}::"TerritoryLevel"
          ${filters.electionYear ? Prisma.sql`AND tvs.election_year = ${filters.electionYear}` : Prisma.empty}
          ${filters.round ? Prisma.sql`AND tvs.round = ${filters.round}` : Prisma.empty}
          ${filters.officeId ? Prisma.sql`AND tvs.office_id = ${filters.officeId}::uuid` : Prisma.empty}
        ORDER BY ${scopeId}, tvs.votes DESC
      ),
      scoped AS (
        SELECT
          selected.scope_id,
          SUM(selected.votes)::integer AS votes,
          MAX(selected.total_votes)::integer AS total_votes,
          CASE WHEN MAX(selected.total_votes) > 0 THEN ROUND(SUM(selected.votes)::numeric / MAX(selected.total_votes)::numeric * 100, 5) ELSE NULL END AS vote_share
        FROM selected
        WHERE selected.scope_id IS NOT NULL
        GROUP BY selected.scope_id
      )
      SELECT
        scoped.scope_id::text AS id,
        ${territoryName} AS name,
        ${filters.level}::text AS level,
        ${extraSelect},
        scoped.votes,
        scoped.total_votes,
        scoped.vote_share::text,
        compare_selected.votes AS compare_votes,
        compare_selected.vote_share::text AS compare_vote_share,
        CASE
          WHEN compare_selected.vote_share IS NOT NULL AND scoped.vote_share IS NOT NULL
          THEN (scoped.vote_share - compare_selected.vote_share)::text
          ELSE NULL
        END AS share_delta,
        previous_selected.votes AS previous_votes,
        previous_selected.vote_share::text AS previous_vote_share,
        CASE
          WHEN previous_selected.votes IS NOT NULL THEN scoped.votes - previous_selected.votes
          ELSE NULL
        END AS growth_votes,
        CASE
          WHEN previous_selected.vote_share IS NOT NULL AND scoped.vote_share IS NOT NULL
          THEN (scoped.vote_share - previous_selected.vote_share)::text
          ELSE NULL
        END AS growth_share_delta,
        dominant.candidate_id::text AS dominant_candidate_id,
        dominant.candidate_name AS dominant_candidate_name,
        dominant.party_acronym AS dominant_party,
        dominant.votes AS dominant_votes,
        dominant.vote_share::text AS dominant_vote_share,
        GREATEST(scoped.total_votes - scoped.votes, 0)::integer AS potential_votes,
        ST_AsGeoJSON(${geometry}) AS geometry
      FROM scoped
      ${scopeJoin}
      ${extraJoinForSection}
      LEFT JOIN compare_selected ON compare_selected.scope_id = scoped.scope_id
      LEFT JOIN previous_selected ON previous_selected.scope_id = scoped.scope_id
      LEFT JOIN dominant ON dominant.scope_id = scoped.scope_id
      WHERE ${geometry} IS NOT NULL
      ORDER BY scoped.votes DESC
      LIMIT ${filters.limit}
    `
  );

  const bounds = await getMapBounds(filters);
  return { rows, bounds };
}

export async function getMapBounds(filters: Pick<MapGeoJsonFilters, "campaignId" | "level" | "municipalityId">) {
  const geometry = geometrySql(filters.level);
  const scopeJoin = scopeJoinSql(filters.level);

  const [bounds] = await getPrisma().$queryRaw<BoundsRow[]>(
    Prisma.sql`
      WITH scopes AS (
        SELECT DISTINCT ${scopeIdSql(filters.level)} AS scope_id
        FROM territorial_vote_summaries tvs
        WHERE tvs.campaign_id = ${filters.campaignId}::uuid
          AND tvs.territory_level = ${filters.level}::"TerritoryLevel"
          ${filters.municipalityId ? Prisma.sql`AND tvs.municipality_id = ${filters.municipalityId}::uuid` : Prisma.empty}
      ),
      scoped AS (
        SELECT scope_id FROM scopes WHERE scope_id IS NOT NULL
      ),
      geoms AS (
        SELECT ${geometry} AS geom
        FROM scoped
        ${scopeJoin}
        WHERE ${geometry} IS NOT NULL
      ),
      extent AS (
        SELECT ST_Extent(geom) AS box FROM geoms
      )
      SELECT
        ST_XMin(box)::float AS west,
        ST_YMin(box)::float AS south,
        ST_XMax(box)::float AS east,
        ST_YMax(box)::float AS north
      FROM extent
      WHERE box IS NOT NULL
    `
  );

  return bounds;
}

export async function getMapTimeseries(input: {
  campaignId: string;
  territoryLevel: MapLayerLevel;
  territoryId: string;
  candidateId?: string;
  officeId?: string;
}) {
  const scopeId = scopeIdSql(input.territoryLevel);

  return getPrisma().$queryRaw<
    Array<{
      election_year: number;
      round: number;
      votes: number;
      total_votes: number;
      vote_share: string | null;
    }>
  >(
    Prisma.sql`
      SELECT
        tvs.election_year,
        tvs.round,
        SUM(tvs.votes)::integer AS votes,
        MAX(tvs.total_votes)::integer AS total_votes,
        CASE WHEN MAX(tvs.total_votes) > 0 THEN ROUND(SUM(tvs.votes)::numeric / MAX(tvs.total_votes)::numeric * 100, 5)::text ELSE NULL END AS vote_share
      FROM territorial_vote_summaries tvs
      WHERE tvs.campaign_id = ${input.campaignId}::uuid
        AND tvs.territory_level = ${input.territoryLevel}::"TerritoryLevel"
        AND ${scopeId} = ${input.territoryId}::uuid
        ${input.candidateId ? Prisma.sql`AND tvs.candidate_id = ${input.candidateId}::uuid` : Prisma.empty}
        ${input.officeId ? Prisma.sql`AND tvs.office_id = ${input.officeId}::uuid` : Prisma.empty}
      GROUP BY tvs.election_year, tvs.round
      ORDER BY tvs.election_year ASC, tvs.round ASC
    `
  );
}
