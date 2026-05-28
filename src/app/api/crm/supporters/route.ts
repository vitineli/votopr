import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { assertCampaignAccess } from "@/repositories/analytics/analytics-repository";
import { crmListSchema, supporterSchema } from "@/repositories/crm/crm-repository";
import { requireWorkspace } from "@/services/security/api-auth";

export async function GET(request: Request) {
  const guard = await requireWorkspace(request);
  if ("response" in guard) return guard.response;

  const parsed = crmListSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Parametros invalidos.", details: parsed.error.flatten() }, { status: 400 });

  await assertCampaignAccess(parsed.data.campaignId, guard.workspace.organization.id);
  const supporters = await getPrisma().politicalSupporter.findMany({
    where: { campaignId: parsed.data.campaignId, organizationId: guard.workspace.organization.id },
    orderBy: { createdAt: "desc" },
    take: parsed.data.limit
  });

  return NextResponse.json({ supporters });
}

export async function POST(request: Request) {
  const guard = await requireWorkspace(request);
  if ("response" in guard) return guard.response;

  const parsed = supporterSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Parametros invalidos.", details: parsed.error.flatten() }, { status: 400 });

  await assertCampaignAccess(parsed.data.campaignId, guard.workspace.organization.id);
  const supporter = await getPrisma().politicalSupporter.create({
    data: {
      ...parsed.data,
      organizationId: guard.workspace.organization.id
    }
  });

  return NextResponse.json({ supporter });
}
