import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCampaignAccess } from "@/repositories/analytics/analytics-repository";
import { getMapTimeseries } from "@/repositories/maps/map-repository";
import { requireWorkspace } from "@/services/security/api-auth";

const querySchema = z.object({
  campaignId: z.string().uuid(),
  territoryLevel: z.enum(["MUNICIPALITY", "NEIGHBORHOOD", "ZONE", "SECTION"]),
  territoryId: z.string().uuid(),
  candidateId: z.string().uuid().optional(),
  officeId: z.string().uuid().optional()
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
    const series = await getMapTimeseries(parsed.data);
    return NextResponse.json({ series });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar serie territorial.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
