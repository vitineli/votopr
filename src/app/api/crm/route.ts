import { NextResponse } from "next/server";
import { assertCampaignAccess } from "@/repositories/analytics/analytics-repository";
import { crmListSchema, listCrm } from "@/repositories/crm/crm-repository";
import { requireWorkspace } from "@/services/security/api-auth";

export async function GET(request: Request) {
  const guard = await requireWorkspace(request);
  if ("response" in guard) return guard.response;

  const parsed = crmListSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parametros invalidos.", details: parsed.error.flatten() }, { status: 400 });
  }

  await assertCampaignAccess(parsed.data.campaignId, guard.workspace.organization.id);
  const crm = await listCrm(parsed.data.campaignId, guard.workspace.organization.id, parsed.data.limit);
  return NextResponse.json(
    { crm },
    {
      headers: {
        "Cache-Control": "private, max-age=20, stale-while-revalidate=90"
      }
    }
  );
}
