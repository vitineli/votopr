import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCampaignAccess } from "@/repositories/analytics/analytics-repository";
import { getPoliticalIntelligenceOverview } from "@/repositories/intelligence/intelligence-repository";
import { requireWorkspace } from "@/services/security/api-auth";

const querySchema = z.object({
  campaignId: z.string().uuid(),
  territoryLevel: z.enum(["MUNICIPALITY", "NEIGHBORHOOD", "ZONE", "SECTION"]).default("MUNICIPALITY"),
  candidateId: z.string().uuid().optional(),
  officeId: z.string().uuid().optional(),
  electionYear: z.coerce.number().int().optional(),
  round: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(300).default(120)
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
    const intelligence = await getPoliticalIntelligenceOverview({
      ...parsed.data,
      organizationId: guard.workspace.organization.id
    });

    return NextResponse.json(intelligence, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar inteligencia politica.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
