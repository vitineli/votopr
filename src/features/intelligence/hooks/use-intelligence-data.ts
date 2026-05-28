"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type IntelligenceLevel = "MUNICIPALITY" | "NEIGHBORHOOD" | "ZONE" | "SECTION";

export type TerritoryScore = {
  territoryId: string;
  territoryName: string;
  territoryLevel: IntelligenceLevel;
  totalVotes: number;
  candidateVotes: number;
  candidateShare: number;
  topCompetitorShare: number;
  potentialVotes: number;
  orphanVotes: number;
  leaders: number;
  supporters: number;
  visitsCompleted: number;
  openDemands: number;
  coverageScore: number;
  potentialScore: number;
  difficultyScore: number;
  competitionScore: number;
  opportunityScore: number;
  priorityScore: number;
  growthPossibleVotes: number;
  costBenefitScore: number;
  neglected: boolean;
  opportunityType: "EXPANSAO" | "DEFESA" | "RECUPERACAO" | "COBERTURA";
  rationale: string;
};

export type StrategicInsight = {
  type: string;
  severity: string;
  title: string;
  description: string;
  recommendation: string;
  score: number;
  territoryId: string;
  territoryName: string;
};

export type IntelligenceOverview = {
  kpis: {
    territories: number;
    averagePriority: number;
    neglectedTerritories: number;
    opportunityVotes: number;
    orphanVotes: number;
    leaders: number;
    supporters: number;
    visitsCompleted: number;
    openDemands: number;
  };
  scores: TerritoryScore[];
  insights: StrategicInsight[];
};

export type OperationPlanInput = {
  campaignId: string;
  name?: string;
  territoryLevel: IntelligenceLevel;
  candidateId?: string;
  officeId?: string;
  fieldWorkers: number;
  vehicles: number;
  budget: number;
  targetVotes: number;
};

export function usePoliticalIntelligence(input: {
  campaignId: string;
  territoryLevel: IntelligenceLevel;
  candidateId?: string;
  officeId?: string;
}) {
  return useQuery({
    queryKey: ["political-intelligence", input],
    queryFn: async (): Promise<IntelligenceOverview> => {
      const params = new URLSearchParams();
      params.set("campaignId", input.campaignId);
      params.set("territoryLevel", input.territoryLevel);
      params.set("limit", "160");
      if (input.candidateId) params.set("candidateId", input.candidateId);
      if (input.officeId) params.set("officeId", input.officeId);

      const response = await fetch(`/api/intelligence/overview?${params.toString()}`);
      if (!response.ok) throw new Error("Falha ao carregar inteligencia politica.");
      return response.json();
    },
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous
  });
}

export function useCrmSummary(campaignId: string) {
  return useQuery({
    queryKey: ["crm-summary", campaignId],
    queryFn: async () => {
      const response = await fetch(`/api/crm?campaignId=${campaignId}&limit=40`);
      if (!response.ok) throw new Error("Falha ao carregar CRM politico.");
      return response.json() as Promise<{
        crm: {
          leaders: Array<Record<string, unknown>>;
          supporters: Array<Record<string, unknown>>;
          visits: Array<Record<string, unknown>>;
          events: Array<Record<string, unknown>>;
          demands: Array<Record<string, unknown>>;
        };
      }>;
    },
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous
  });
}

export function useCreateOperationPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: OperationPlanInput) => {
      const response = await fetch("/api/intelligence/operation-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      if (!response.ok) throw new Error("Falha ao gerar plano de rua.");
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["operation-plans", variables.campaignId] });
      queryClient.invalidateQueries({ queryKey: ["political-intelligence"] });
    }
  });
}

export function useCreateCrmRecord(resource: "leaders" | "supporters" | "visits" | "events" | "demands", campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const response = await fetch(`/api/crm/${resource}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, campaignId })
      });
      if (!response.ok) throw new Error("Falha ao salvar registro politico.");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-summary", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["political-intelligence"] });
    }
  });
}
