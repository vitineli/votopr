import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCampaignAccess, getAnalyticsFilters } from "@/repositories/analytics/analytics-repository";
import { requireWorkspace } from "@/services/security/api-auth";

const querySchema = z.object({
  campaignId: z.string().uuid()
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
    const filters = await getAnalyticsFilters(parsed.data.campaignId);
    return NextResponse.json(
      { filters },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=1800"
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar filtros.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
