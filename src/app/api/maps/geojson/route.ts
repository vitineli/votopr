import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { assertCampaignAccess } from "@/repositories/analytics/analytics-repository";
import { getMapGeoJsonRows, toFeatureCollection } from "@/repositories/maps/map-repository";
import { requireWorkspace } from "@/services/security/api-auth";

const querySchema = z.object({
  campaignId: z.string().uuid(),
  level: z.enum(["MUNICIPALITY", "NEIGHBORHOOD", "ZONE", "SECTION"]).default("MUNICIPALITY"),
  electionYear: z.coerce.number().int().optional(),
  round: z.coerce.number().int().optional(),
  officeId: z.string().uuid().optional(),
  candidateId: z.string().uuid().optional(),
  compareCandidateId: z.string().uuid().optional(),
  partyId: z.string().uuid().optional(),
  municipalityId: z.string().uuid().optional(),
  neighborhoodId: z.string().uuid().optional(),
  zoneId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(20000).default(5000)
});

export async function GET(request: Request) {
  const guard = await requireWorkspace(request);
  if ("response" in guard) return guard.response;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));

  if (!parsed.success) {
    return NextResponse.json({ error: "Parametros invalidos.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await assertCampaignAccess(parsed.data.campaignId, guard.workspace.organization.id);
    const { rows, bounds } = await getMapGeoJsonRows(parsed.data);
    const collection = toFeatureCollection(rows, parsed.data, bounds);
    const cacheSeconds = getEnv().MAP_GEOJSON_CACHE_SECONDS;

    return NextResponse.json(collection, {
      headers: {
        "Cache-Control": cacheSeconds > 0
          ? `private, max-age=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 5}`
          : "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar GeoJSON eleitoral.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
