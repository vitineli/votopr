import { cache } from "react";
import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { normalizeText } from "@/lib/utils";

type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: {
    name?: string;
    organization?: string;
  };
};

function slugify(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const ensureWorkspaceRecord = cache(async (userId: string, email: string, name: string, organizationName: string) => {
  const prisma = getPrisma();

  await prisma.user.upsert({
    where: { id: userId },
    update: { email, name },
    create: { id: userId, email, name }
  });

  const existingMembership = await prisma.organizationMember.findFirst({
    where: { userId },
    include: {
      organization: {
        include: {
          campaigns: {
            orderBy: { createdAt: "asc" }
          }
        }
      }
    }
  });

  if (existingMembership) {
    const campaign = existingMembership.organization.campaigns[0]
      ?? await prisma.campaign.create({
        data: {
          organizationId: existingMembership.organizationId,
          name: "Inteligencia PR 2026",
          slug: "inteligencia-pr-2026",
          electionYear: 2026
        }
      });

    return {
      user: { id: userId, email, name },
      organization: existingMembership.organization,
      campaign,
      role: existingMembership.role
    };
  }

  const baseSlug = slugify(organizationName) || "campanha-parana";
  const suffix = userId.slice(0, 8);
  const slug = `${baseSlug}-${suffix}`;

  const organization = await prisma.organization.create({
    data: {
      name: organizationName,
      slug,
      members: {
        create: {
          userId,
          role: "OWNER"
        }
      },
      campaigns: {
        create: {
          name: "Inteligencia PR 2026",
          slug: "inteligencia-pr-2026",
          electionYear: 2026
        }
      }
    },
    include: {
      campaigns: true
    }
  });

  return {
    user: { id: userId, email, name },
    organization,
    campaign: organization.campaigns[0],
    role: "OWNER" as const
  };
});

export async function ensureDefaultWorkspace(authUser: AuthUser) {
  const email = authUser.email ?? `${authUser.id}@local.invalid`;
  const name = authUser.user_metadata?.name ?? email.split("@")[0];
  const organizationName = authUser.user_metadata?.organization ?? "Campanha Parana";

  return ensureWorkspaceRecord(authUser.id, email, name, organizationName);
}

export async function getDashboardSnapshot(campaignId: string, organizationId: string) {
  const prisma = getPrisma();

  const [uploads, municipalities, zones, sections, dataAgg] = await Promise.all([
    prisma.electoralUpload.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 6
    }),
    prisma.municipality.count({ where: { state: "PR" } }),
    prisma.electoralZone.count(),
    prisma.electoralSection.count(),
    prisma.electoralData.aggregate({
      where: { campaignId },
      _sum: { votes: true },
      _count: true
    })
  ]);

  return {
    uploads,
    totals: {
      municipalities,
      zones,
      sections,
      rows: dataAgg._count,
      votes: dataAgg._sum.votes ?? 0
    }
  };
}

export type DashboardSnapshot = Prisma.PromiseReturnType<typeof getDashboardSnapshot>;
