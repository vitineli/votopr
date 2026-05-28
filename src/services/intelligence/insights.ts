import type { StrategicInsightSeverity, StrategicInsightType } from "@prisma/client";
import type { TerritoryScore } from "@/services/intelligence/scoring";

export type GeneratedStrategicInsight = {
  type: StrategicInsightType;
  severity: StrategicInsightSeverity;
  title: string;
  description: string;
  recommendation: string;
  score: number;
  territoryId: string;
  territoryName: string;
};

export function generateStrategicInsights(scores: TerritoryScore[]): GeneratedStrategicInsight[] {
  const insights: GeneratedStrategicInsight[] = [];

  for (const territory of scores.slice(0, 60)) {
    if (territory.neglected && territory.potentialVotes > 250) {
      insights.push({
        type: "NEGLECTED_AREA",
        severity: territory.potentialVotes > 1500 ? "HIGH" : "MEDIUM",
        title: `Cobertura baixa em ${territory.territoryName}`,
        description: `A regiao tem ${territory.potentialVotes.toLocaleString("pt-BR")} votos disputaveis e pouca presenca registrada de equipe.`,
        recommendation: "Direcionar lideranca local, agenda de rua e pelo menos uma visita de validacao nos proximos 7 dias.",
        score: territory.priorityScore,
        territoryId: territory.territoryId,
        territoryName: territory.territoryName
      });
    }

    if (territory.orphanVotes >= 120 || territory.orphanVotes / Math.max(territory.totalVotes, 1) >= 0.08) {
      insights.push({
        type: "ORPHAN_VOTES",
        severity: territory.orphanVotes > 800 ? "HIGH" : "MEDIUM",
        title: `Votos orfaos relevantes em ${territory.territoryName}`,
        description: `${territory.orphanVotes.toLocaleString("pt-BR")} votos brancos/nulos ou nao nominais indicam eleitorado menos cristalizado.`,
        recommendation: "Usar mensagem de conversao simples, presenca de bairro e abordagem por liderancas confiaveis.",
        score: territory.opportunityScore,
        territoryId: territory.territoryId,
        territoryName: territory.territoryName
      });
    }

    if (territory.competitionScore < 32 && territory.opportunityScore > 55) {
      insights.push({
        type: "OPPORTUNITY",
        severity: territory.opportunityScore > 70 ? "HIGH" : "MEDIUM",
        title: `Baixa concorrencia relativa em ${territory.territoryName}`,
        description: `Concorrencia em ${territory.competitionScore.toFixed(1)}% com oportunidade de ${territory.opportunityScore.toFixed(1)} pontos.`,
        recommendation: "Aumentar cobertura de rua antes que concorrentes ocupem o espaco territorial.",
        score: territory.opportunityScore,
        territoryId: territory.territoryId,
        territoryName: territory.territoryName
      });
    }

    if (territory.previousShare !== null && territory.candidateShare < territory.previousShare - 4) {
      insights.push({
        type: "RISK",
        severity: territory.previousShare - territory.candidateShare > 9 ? "HIGH" : "MEDIUM",
        title: `Perda territorial em ${territory.territoryName}`,
        description: `O share caiu de ${territory.previousShare.toFixed(1)}% para ${territory.candidateShare.toFixed(1)}%.`,
        recommendation: "Revisar mensagem, agenda e responsavel territorial; priorizar escuta ativa com liderancas locais.",
        score: territory.difficultyScore,
        territoryId: territory.territoryId,
        territoryName: territory.territoryName
      });
    }
  }

  return insights
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}
