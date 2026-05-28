import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { assertCampaignAccess } from "@/repositories/analytics/analytics-repository";
import { crmListSchema, visitSchema } from "@/repositories/crm/crm-repository";
import { requireWorkspace } from "@/services/security/api-auth";

export async function GET(request: Request) {
  const guard = await requireWorkspace(request);
  if ("response" in guard) return guard.response;

  const parsed = crmListSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Parametros invalidos.", details: parsed.error.flatten() }, { status: 400 });

  await assertCampaignAccess(parsed.data.campaignId, guard.workspace.organization.id);
  const visits = await getPrisma().fieldVisit.findMany({
    where: { campaignId: parsed.data.campaignId, organizationId: guard.workspace.organization.id },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }],
    take: parsed.data.limit
  });

  return NextResponse.json({ visits });
}

export async function POST(request: Request) {
  const guard = await requireWorkspace(request);
  if ("response" in guard) return guard.response;

  const parsed = visitSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Parametros invalidos.", details: parsed.error.flatten() }, { status: 400 });

  await assertCampaignAccess(parsed.data.campaignId, guard.workspace.organization.id);
  const visit = await getPrisma().fieldVisit.create({
    data: {
      ...parsed.data,
      organizationId: guard.workspace.organization.id
    }
  });

  return NextResponse.json({ visit });
}
