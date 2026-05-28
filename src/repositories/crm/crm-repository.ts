import { z } from "zod";
import { getPrisma } from "@/lib/prisma";

export const crmListSchema = z.object({
  campaignId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(30)
});

const territorySchema = z.object({
  territoryLevel: z.enum(["MUNICIPALITY", "NEIGHBORHOOD", "ZONE", "SECTION"]).default("MUNICIPALITY"),
  municipalityId: z.string().uuid().optional(),
  electoralZoneId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  neighborhoodId: z.string().uuid().optional()
});

export const leaderSchema = territorySchema.extend({
  campaignId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().optional(),
  role: z.string().trim().max(120).optional(),
  influence: z.enum(["LOW", "MEDIUM", "HIGH", "STRATEGIC"]).default("MEDIUM"),
  status: z.enum(["PROSPECT", "ACTIVE", "SUPPORTER", "UNDECIDED", "OPPOSED", "INACTIVE"]).default("PROSPECT"),
  estimatedVotes: z.coerce.number().int().min(0).max(100000).default(0),
  reliabilityScore: z.coerce.number().int().min(0).max(100).default(50),
  notes: z.string().max(2000).optional()
});

export const supporterSchema = territorySchema.extend({
  campaignId: z.string().uuid(),
  leaderId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().optional(),
  status: z.enum(["PROSPECT", "ACTIVE", "SUPPORTER", "UNDECIDED", "OPPOSED", "INACTIVE"]).default("PROSPECT"),
  voteCommitmentScore: z.coerce.number().int().min(0).max(100).default(50),
  contactPreference: z.string().trim().max(80).optional(),
  notes: z.string().max(2000).optional()
});

export const visitSchema = territorySchema.extend({
  campaignId: z.string().uuid(),
  leaderId: z.string().uuid().optional(),
  supporterId: z.string().uuid().optional(),
  assignedTo: z.string().trim().max(120).optional(),
  objective: z.string().trim().min(3).max(240),
  result: z.string().trim().max(1000).optional(),
  status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"]).default("PLANNED"),
  scheduledFor: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
  votersReached: z.coerce.number().int().min(0).max(100000).default(0),
  cost: z.coerce.number().min(0).optional(),
  notes: z.string().max(2000).optional()
});

export const eventSchema = territorySchema.extend({
  campaignId: z.string().uuid(),
  leaderId: z.string().uuid().optional(),
  name: z.string().trim().min(3).max(180),
  eventType: z.enum(["WALK", "MEETING", "RALLY", "CANVASSING", "TRAINING", "COMMUNITY"]).default("MEETING"),
  status: z.enum(["PLANNED", "CONFIRMED", "COMPLETED", "CANCELLED"]).default("PLANNED"),
  startsAt: z.coerce.date().optional(),
  expectedAudience: z.coerce.number().int().min(0).max(100000).default(0),
  actualAudience: z.coerce.number().int().min(0).max(100000).default(0),
  cost: z.coerce.number().min(0).optional(),
  notes: z.string().max(2000).optional()
});

export const demandSchema = territorySchema.extend({
  campaignId: z.string().uuid(),
  leaderId: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(180),
  category: z.string().trim().min(2).max(80),
  priority: z.coerce.number().int().min(1).max(5).default(3),
  status: z.enum(["OPEN", "TRIAGED", "IN_PROGRESS", "RESOLVED", "REJECTED"]).default("OPEN"),
  description: z.string().max(3000).optional()
});

export async function listCrm(campaignId: string, organizationId: string, limit: number) {
  const prisma = getPrisma();
  const [leaders, supporters, visits, events, demands] = await Promise.all([
    prisma.politicalLeader.findMany({
      where: { campaignId, organizationId },
      orderBy: [{ influence: "desc" }, { createdAt: "desc" }],
      take: limit
    }),
    prisma.politicalSupporter.findMany({
      where: { campaignId, organizationId },
      orderBy: { createdAt: "desc" },
      take: limit
    }),
    prisma.fieldVisit.findMany({
      where: { campaignId, organizationId },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }],
      take: limit
    }),
    prisma.politicalEvent.findMany({
      where: { campaignId, organizationId },
      orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
      take: limit
    }),
    prisma.politicalDemand.findMany({
      where: { campaignId, organizationId },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: limit
    })
  ]);

  return { leaders, supporters, visits, events, demands };
}
