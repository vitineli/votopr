import type { TerritoryLevel } from "@prisma/client";

export type RawTerritoryMetrics = {
  territoryId: string;
  territoryName: string;
  territoryLevel: TerritoryLevel;
  municipalityId: string | null;
  electoralZoneId: string | null;
  sectionId: string | null;
  neighborhoodId: string | null;
  totalVotes: number;
  candidateVotes: number;
  candidateShare: number;
  topCompetitorVotes: number;
  topCompetitorShare: number;
  blankNullVotes: number;
  previousVotes: number | null;
  previousShare: number | null;
  leaders: number;
  supporters: number;
  visitsCompleted: number;
  visitsPlanned: number;
  openDemands: number;
  events: number;
};

export type TerritoryScore = RawTerritoryMetrics & {
  potentialVotes: number;
  orphanVotes: number;
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

export type OperationInput = {
  fieldWorkers: number;
  vehicles: number;
  budget: number;
  targetVotes: number;
};

export type AllocationSuggestion = TerritoryScore & {
  allocatedWorkers: number;
  allocatedVehicles: number;
  allocatedBudget: number;
  expectedVotes: number;
  costPerExpectedVote: number | null;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function safePercent(part: number, total: number) {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function calculateTerritoryScore(metrics: RawTerritoryMetrics): TerritoryScore {
  const potentialVotes = Math.max(metrics.totalVotes - metrics.candidateVotes, 0);
  const orphanVotes = metrics.blankNullVotes;
  const potentialRatio = safePercent(potentialVotes, metrics.totalVotes);
  const orphanRatio = safePercent(orphanVotes, metrics.totalVotes);
  const demandPressure = clamp(metrics.openDemands * 12, 0, 100);
  const coverageScore = clamp(
    metrics.leaders * 18
    + metrics.supporters * 1.8
    + metrics.visitsCompleted * 7
    + metrics.visitsPlanned * 3
    + metrics.events * 5
  );
  const neglectScore = clamp(100 - coverageScore + demandPressure * 0.18);
  const competitionScore = clamp(metrics.topCompetitorShare);
  const historicalDelta = metrics.previousShare === null ? 0 : metrics.candidateShare - metrics.previousShare;
  const positiveGrowth = clamp(historicalDelta * 4, 0, 100);
  const negativeGrowthRisk = clamp(Math.abs(Math.min(historicalDelta, 0)) * 4, 0, 100);
  const potentialScore = clamp(potentialRatio * 0.68 + orphanRatio * 1.35 + neglectScore * 0.2);
  const difficultyScore = clamp(
    competitionScore * 0.52
    + (100 - metrics.candidateShare) * 0.22
    + demandPressure * 0.12
    + negativeGrowthRisk * 0.14
  );
  const opportunityScore = clamp(
    potentialScore * 0.36
    + (100 - competitionScore) * 0.18
    + neglectScore * 0.22
    + orphanRatio * 0.9
    + positiveGrowth * 0.12
  );
  const priorityScore = clamp(
    opportunityScore * 0.42
    + potentialScore * 0.26
    + (100 - difficultyScore) * 0.16
    + neglectScore * 0.16
  );
  const conversionRate = clamp((opportunityScore - difficultyScore * 0.35) / 100, 0.04, 0.42);
  const growthPossibleVotes = Math.round(potentialVotes * conversionRate);
  const costBenefitScore = clamp(priorityScore * 0.55 + safePercent(growthPossibleVotes, Math.max(metrics.totalVotes, 1)) * 120);
  const neglected = coverageScore < 28 && metrics.totalVotes >= 300;

  let opportunityType: TerritoryScore["opportunityType"] = "EXPANSAO";
  if (metrics.candidateShare >= 45 && competitionScore <= 35) opportunityType = "DEFESA";
  if (metrics.candidateShare < 25 && potentialVotes > metrics.candidateVotes) opportunityType = "RECUPERACAO";
  if (neglected) opportunityType = "COBERTURA";

  const rationale = [
    neglected ? "territorio com baixa cobertura de equipe" : "territorio com cobertura ativa",
    potentialVotes > 0 ? `${potentialVotes.toLocaleString("pt-BR")} votos ainda disputaveis` : "baixo espaco numerico para expansao",
    orphanVotes > 0 ? `${orphanVotes.toLocaleString("pt-BR")} votos brancos/nulos ou nao nominais` : "sem volume relevante de votos orfaos",
    competitionScore >= 45 ? "concorrencia forte" : "concorrencia administravel"
  ].join("; ");

  return {
    ...metrics,
    potentialVotes,
    orphanVotes,
    coverageScore: round(coverageScore),
    potentialScore: round(potentialScore),
    difficultyScore: round(difficultyScore),
    competitionScore: round(competitionScore),
    opportunityScore: round(opportunityScore),
    priorityScore: round(priorityScore),
    growthPossibleVotes,
    costBenefitScore: round(costBenefitScore),
    neglected,
    opportunityType,
    rationale
  };
}

export function buildAllocationSuggestions(scores: TerritoryScore[], input: OperationInput): AllocationSuggestion[] {
  const prioritized = [...scores]
    .filter((score) => score.priorityScore > 0 && score.growthPossibleVotes > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, Math.max(8, Math.min(30, input.fieldWorkers * 3 || 12)));

  const totalWeight = prioritized.reduce((sum, score) => sum + Math.max(score.priorityScore, 1), 0) || 1;
  let remainingWorkers = input.fieldWorkers;
  let remainingVehicles = input.vehicles;
  let remainingBudget = input.budget;

  return prioritized.map((score, index) => {
    const weight = Math.max(score.priorityScore, 1) / totalWeight;
    const isLast = index === prioritized.length - 1;
    const allocatedWorkers = isLast
      ? remainingWorkers
      : Math.min(remainingWorkers, Math.max(score.neglected ? 1 : 0, Math.round(input.fieldWorkers * weight)));
    remainingWorkers -= allocatedWorkers;

    const allocatedVehicles = isLast
      ? remainingVehicles
      : Math.min(remainingVehicles, Math.round(input.vehicles * weight));
    remainingVehicles -= allocatedVehicles;

    const allocatedBudget = isLast
      ? remainingBudget
      : Math.min(remainingBudget, Math.round(input.budget * weight * 100) / 100);
    remainingBudget = round(remainingBudget - allocatedBudget, 2);

    const capacityVotes = allocatedWorkers * 55 + allocatedVehicles * 180 + Math.floor(allocatedBudget / 18);
    const expectedVotes = Math.max(0, Math.min(score.growthPossibleVotes, capacityVotes, input.targetVotes));
    const costPerExpectedVote = expectedVotes > 0 ? round(allocatedBudget / expectedVotes, 2) : null;

    return {
      ...score,
      allocatedWorkers,
      allocatedVehicles,
      allocatedBudget: round(allocatedBudget, 2),
      expectedVotes,
      costPerExpectedVote
    };
  });
}

export function summarizePlan(allocations: AllocationSuggestion[], input: OperationInput) {
  const expectedVotes = allocations.reduce((sum, allocation) => sum + allocation.expectedVotes, 0);
  const allocatedWorkers = allocations.reduce((sum, allocation) => sum + allocation.allocatedWorkers, 0);
  const allocatedVehicles = allocations.reduce((sum, allocation) => sum + allocation.allocatedVehicles, 0);
  const allocatedBudget = allocations.reduce((sum, allocation) => sum + allocation.allocatedBudget, 0);

  return {
    expectedVotes,
    targetCoverage: round(safePercent(expectedVotes, input.targetVotes)),
    allocatedWorkers,
    allocatedVehicles,
    allocatedBudget: round(allocatedBudget, 2),
    averageCostPerVote: expectedVotes > 0 ? round(allocatedBudget / expectedVotes, 2) : null
  };
}
