import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { assertCampaignAccess } from "@/repositories/analytics/analytics-repository";
import { requireWorkspace } from "@/services/security/api-auth";

const paramsSchema = z.object({
  level: z.enum(["MUNICIPALITY", "NEIGHBORHOOD", "ZONE", "SECTION"]),
  z: z.coerce.number().int().min(0).max(22),
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0)
});

const querySchema = z.object({
  campaignId: z.string().uuid(),
  electionYear: z.coerce.number().int().optional(),
  round: z.coerce.number().int().optional(),
  officeId: z.string().uuid().optional(),
  candidateId: z.string().uuid().optional(),
  partyId: z.string().uuid().optional(),
  municipalityId: z.string().uuid().optional()
});

function scopeIdSql(level: string) {
  switch (level) {
    case "MUNICIPALITY":
      return Prisma.sql`tvs.municipality_id`;
    case "NEIGHBORHOOD":
      return Prisma.sql`tvs.neighborhood_id`;
    case "ZONE":
      return Prisma.sql`tvs.electoral_zone_id`;
    default:
      return Prisma.sql`tvs.section_id`;
  }
}

function geometrySql(level: string) {
  switch (level) {
    case "MUNICIPALITY":
      return Prisma.sql`m.boundary`;
    case "NEIGHBORHOOD":
      return Prisma.sql`n.boundary`;
    case "ZONE":
      return Prisma.sql`z.boundary`;
    default:
      return Prisma.sql`s.geom`;
  }
}

function joinsSql(level: string) {
  switch (level) {
    case "MUNICIPALITY":
      return Prisma.sql`JOIN municipalities m ON m.id = scoped.scope_id`;
    case "NEIGHBORHOOD":
      return Prisma.sql`
        JOIN neighborhoods n ON n.id = scoped.scope_id
        JOIN municipalities m ON m.id = n.municipality_id
      `;
    case "ZONE":
      return Prisma.sql`
        JOIN electoral_zones z ON z.id = scoped.scope_id
        JOIN municipalities m ON m.id = z.municipality_id
      `;
    default:
      return Prisma.sql`
        JOIN electoral_sections s ON s.id = scoped.scope_id
        JOIN municipalities m ON m.id = s.municipality_id
      `;
  }
}

function nameSql(level: string) {
  switch (level) {
    case "MUNICIPALITY":
      return Prisma.sql`m.name`;
    case "NEIGHBORHOOD":
      return Prisma.sql`n.name`;
    case "ZONE":
      return Prisma.sql`'Zona ' || z.number::text`;
    default:
      return Prisma.sql`'Secao ' || s.number::text`;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ level: string; z: string; x: string; y: string }> }
) {
  const guard = await requireWorkspace(request);
  if ("response" in guard) return guard.response;

  const routeParams = paramsSchema.safeParse(await context.params);
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));

  if (!routeParams.success || !query.success) {
    return NextResponse.json({ error: "Parametros invalidos." }, { status: 400 });
  }

  await assertCampaignAccess(query.data.campaignId, guard.workspace.organization.id);

  const level = routeParams.data.level;
  const scopeId = scopeIdSql(level);
  const geometry = geometrySql(level);
  const joins = joinsSql(level);
  const name = nameSql(level);

  const [result] = await getPrisma().$queryRaw<Array<{ tile: Buffer | null }>>(
    Prisma.sql`
      WITH tile AS (
        SELECT ST_TileEnvelope(${routeParams.data.z}, ${routeParams.data.x}, ${routeParams.data.y}) AS bounds
      ),
      scoped AS (
        SELECT
          ${scopeId} AS scope_id,
          SUM(tvs.votes)::integer AS votes,
          MAX(tvs.total_votes)::integer AS total_votes,
          CASE WHEN MAX(tvs.total_votes) > 0 THEN ROUND(SUM(tvs.votes)::numeric / MAX(tvs.total_votes)::numeric * 100, 5) ELSE NULL END AS vote_share
        FROM territorial_vote_summaries tvs
        WHERE tvs.campaign_id = ${query.data.campaignId}::uuid
          AND tvs.territory_level = ${level}::"TerritoryLevel"
          AND ${scopeId} IS NOT NULL
          ${query.data.electionYear ? Prisma.sql`AND tvs.election_year = ${query.data.electionYear}` : Prisma.empty}
          ${query.data.round ? Prisma.sql`AND tvs.round = ${query.data.round}` : Prisma.empty}
          ${query.data.officeId ? Prisma.sql`AND tvs.office_id = ${query.data.officeId}::uuid` : Prisma.empty}
          ${query.data.candidateId ? Prisma.sql`AND tvs.candidate_id = ${query.data.candidateId}::uuid` : Prisma.empty}
          ${query.data.partyId ? Prisma.sql`AND tvs.party_id = ${query.data.partyId}::uuid` : Prisma.empty}
          ${query.data.municipalityId ? Prisma.sql`AND tvs.municipality_id = ${query.data.municipalityId}::uuid` : Prisma.empty}
        GROUP BY ${scopeId}
      ),
      features AS (
        SELECT
          scoped.scope_id::text AS id,
          ${name} AS name,
          scoped.votes,
          scoped.total_votes,
          scoped.vote_share,
          ST_AsMVTGeom(ST_Transform(${geometry}, 3857), tile.bounds, 4096, 64, true) AS geom
        FROM scoped
        ${joins}
        CROSS JOIN tile
        WHERE ${geometry} IS NOT NULL
          AND ST_Intersects(ST_Transform(${geometry}, 3857), tile.bounds)
      )
      SELECT ST_AsMVT(features, 'electoral', 4096, 'geom') AS tile
      FROM features
    `
  );

  const tile = result?.tile ?? Buffer.alloc(0);
  const body = tile.buffer.slice(tile.byteOffset, tile.byteOffset + tile.byteLength) as ArrayBuffer;

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-protobuf",
      "Cache-Control": "private, max-age=120, stale-while-revalidate=600"
    }
  });
}
