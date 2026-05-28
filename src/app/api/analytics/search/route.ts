import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCampaignAccess, searchAnalyticsEntities } from "@/repositories/analytics/analytics-repository";
import { requireWorkspace } from "@/services/security/api-auth";

const querySchema = z.object({
  campaignId: z.string().uuid(),
  q: z.string().trim().min(2).max(80),
  type: z.enum(["municipality", "zone", "section", "neighborhood", "candidate"]).default("municipality"),
  limit: z.coerce.number().int().min(1).max(50).default(20)
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
    const results = await searchAnalyticsEntities({
      campaignId: parsed.data.campaignId,
      query: parsed.data.q,
      type: parsed.data.type,
      limit: parsed.data.limit
    });

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao buscar dados eleitorais.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
