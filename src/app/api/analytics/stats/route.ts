import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCampaignAccess, getTerritoryStats } from "@/repositories/analytics/analytics-repository";
import { requireWorkspace } from "@/services/security/api-auth";

const querySchema = z.object({
  campaignId: z.string().uuid(),
  territoryLevel: z.enum(["STATE", "METROPOLITAN_REGION", "MUNICIPALITY", "NEIGHBORHOOD", "ZONE", "SECTION"]).default("MUNICIPALITY"),
  electionYear: z.coerce.number().int().optional(),
  round: z.coerce.number().int().optional(),
  officeId: z.string().uuid().optional(),
  candidateId: z.string().uuid().optional(),
  municipalityId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100)
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
    const stats = await getTerritoryStats(parsed.data);
    return NextResponse.json({ stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar estatisticas.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
