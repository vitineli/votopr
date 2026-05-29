import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { assertCampaignAccess } from "@/repositories/analytics/analytics-repository";
import { createOperationPlan } from "@/repositories/intelligence/intelligence-repository";
import { requireWorkspace } from "@/services/security/api-auth";

const createPlanSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().trim().min(3).max(120).optional(),
  territoryLevel: z.enum(["MUNICIPALITY", "NEIGHBORHOOD", "ZONE", "SECTION"]).default("MUNICIPALITY"),
  candidateId: z.string().uuid().optional(),
  officeId: z.string().uuid().optional(),
  electionYear: z.coerce.number().int().optional(),
  round: z.coerce.number().int().optional(),
  fieldWorkers: z.coerce.number().int().min(0).max(500),
  vehicles: z.coerce.number().int().min(0).max(200),
  budget: z.coerce.number().min(0).max(100000000),
  targetVotes: z.coerce.number().int().min(1).max(10000000),
  limit: z.coerce.number().int().min(1).max(300).default(160)
});

const listSchema = z.object({
  campaignId: z.string().uuid()
});

export async function GET(request: Request) {
  const guard = await requireWorkspace(request);
  if ("response" in guard) return guard.response;

  const parsed = listSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));

  if (!parsed.success) {
    return NextResponse.json({ error: "Parametros invalidos.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await assertCampaignAccess(parsed.data.campaignId, guard.workspace.organization.id);
    const plans = await getPrisma().operationPlan.findMany({
      where: {
        campaignId: parsed.data.campaignId,
        organizationId: guard.workspace.organization.id
      },
      include: {
        allocations: {
          orderBy: { priorityScore: "desc" },
          take: 8
        }
      },
      orderBy: { createdAt: "desc" },
      take: 12
    });

    return NextResponse.json(
      { plans },
      {
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=60"
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao listar planos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const guard = await requireWorkspace(request);
  if ("response" in guard) return guard.response;

  const parsed = createPlanSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Parametros invalidos.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await assertCampaignAccess(parsed.data.campaignId, guard.workspace.organization.id);
    const plan = await createOperationPlan({
      ...parsed.data,
      organizationId: guard.workspace.organization.id,
      userId: guard.user.id
    });

    return NextResponse.json({ plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar plano de rua.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
