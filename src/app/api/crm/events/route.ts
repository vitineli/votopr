import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { assertCampaignAccess } from "@/repositories/analytics/analytics-repository";
import { crmListSchema, eventSchema } from "@/repositories/crm/crm-repository";
import { requireWorkspace } from "@/services/security/api-auth";

export async function GET(request: Request) {
  const guard = await requireWorkspace(request);
  if ("response" in guard) return guard.response;

  const parsed = crmListSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Parametros invalidos.", details: parsed.error.flatten() }, { status: 400 });

  await assertCampaignAccess(parsed.data.campaignId, guard.workspace.organization.id);
  const events = await getPrisma().politicalEvent.findMany({
    where: { campaignId: parsed.data.campaignId, organizationId: guard.workspace.organization.id },
    orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
    take: parsed.data.limit
  });

  return NextResponse.json({ events });
}

export async function POST(request: Request) {
  const guard = await requireWorkspace(request);
  if ("response" in guard) return guard.response;

  const parsed = eventSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Parametros invalidos.", details: parsed.error.flatten() }, { status: 400 });

  await assertCampaignAccess(parsed.data.campaignId, guard.workspace.organization.id);
  const event = await getPrisma().politicalEvent.create({
    data: {
      ...parsed.data,
      organizationId: guard.workspace.organization.id
    }
  });

  return NextResponse.json({ event });
}
