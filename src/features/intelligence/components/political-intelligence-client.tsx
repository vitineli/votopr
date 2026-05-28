"use client";

import { startTransition, useDeferredValue, useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  ClipboardList,
  Flag,
  Lightbulb,
  MapPinned,
  Megaphone,
  Route,
  ShieldAlert,
  Target,
  UserPlus,
  UsersRound,
  Vote,
  Zap
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAnalyticsFilters } from "@/features/maps/hooks/use-map-data";
import {
  type IntelligenceLevel,
  type TerritoryScore,
  useCreateCrmRecord,
  useCreateOperationPlan,
  useCrmSummary,
  usePoliticalIntelligence
} from "@/features/intelligence/hooks/use-intelligence-data";

const levelLabels: Record<IntelligenceLevel, string> = {
  MUNICIPALITY: "Municípios",
  NEIGHBORHOOD: "Bairros",
  ZONE: "Zonas",
  SECTION: "Seções"
};

const opportunityLabels: Record<TerritoryScore["opportunityType"], string> = {
  EXPANSAO: "Expansão",
  DEFESA: "Defesa",
  RECUPERACAO: "Recuperação",
  COBERTURA: "Cobertura"
};

function formatNumber(value: number | string | null | undefined) {
  const numeric = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("pt-BR").format(numeric ?? 0);
}

function formatCurrency(value: number | string | null | undefined) {
  const numeric = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numeric ?? 0);
}

function scoreTone(value: number) {
  if (value >= 70) return "bg-emerald-400";
  if (value >= 45) return "bg-amber-400";
  return "bg-red-400";
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <div className={`h-full ${scoreTone(value)}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-white/10 bg-white/[0.035]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          {label}
          <Icon className="size-4" />
        </div>
        <div className="mt-3 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-md border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-primary"
      >
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TerritoryRow({ score, index }: { score: TerritoryScore; index: number }) {
  return (
    <div className="grid gap-3 border-b border-white/10 px-4 py-3 last:border-0 xl:grid-cols-[44px_1.5fr_1fr_1fr_1fr_1fr] xl:items-center">
      <div className="font-mono text-sm text-muted-foreground">#{index + 1}</div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{score.territoryName}</span>
          <Badge variant={score.neglected ? "destructive" : "secondary"}>
            {opportunityLabels[score.opportunityType]}
          </Badge>
        </div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{score.rationale}</div>
      </div>
      <MetricStack label="Prioridade" value={score.priorityScore} />
      <MetricStack label="Potencial" value={score.potentialScore} detail={`${formatNumber(score.potentialVotes)} votos`} />
      <MetricStack label="Dificuldade" value={score.difficultyScore} detail={`${score.topCompetitorShare.toFixed(1)}% conc.`} />
      <MetricStack label="Cobertura" value={score.coverageScore} detail={`${score.leaders} lideranças`} />
    </div>
  );
}

function MetricStack({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(0)}</span>
      </div>
      <ScoreBar value={value} />
      {detail ? <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

export function PoliticalIntelligenceClient({ campaignId }: { campaignId: string }) {
  const [territoryLevel, setTerritoryLevel] = useState<IntelligenceLevel>("NEIGHBORHOOD");
  const [candidateId, setCandidateId] = useState("");
  const [officeId, setOfficeId] = useState("");
  const [fieldWorkers, setFieldWorkers] = useState(35);
  const [vehicles, setVehicles] = useState(8);
  const [budget, setBudget] = useState(45000);
  const [targetVotes, setTargetVotes] = useState(6500);
  const [crmTab, setCrmTab] = useState<"leaders" | "supporters" | "visits" | "events" | "demands">("leaders");
  const [quickName, setQuickName] = useState("");
  const [quickDetail, setQuickDetail] = useState("");
  const deferredTerritoryLevel = useDeferredValue(territoryLevel);
  const deferredCandidateId = useDeferredValue(candidateId);
  const deferredOfficeId = useDeferredValue(officeId);
  const filters = useAnalyticsFilters(campaignId);
  const intelligence = usePoliticalIntelligence({
    campaignId,
    territoryLevel: deferredTerritoryLevel,
    candidateId: deferredCandidateId || undefined,
    officeId: deferredOfficeId || undefined
  });
  const crm = useCrmSummary(campaignId);
  const createPlan = useCreateOperationPlan();
  const createCrm = useCreateCrmRecord(crmTab, campaignId);

  const candidateOptions = useMemo(() => (filters.data?.filters.candidates ?? []).map((candidate) => ({
    value: candidate.id,
    label: `${candidate.ballotNumber} - ${candidate.name}${candidate.party?.acronym ? ` (${candidate.party.acronym})` : ""}`
  })), [filters.data]);

  const officeOptions = useMemo(() => (filters.data?.filters.offices ?? []).map((office) => ({
    value: office.id,
    label: office.name
  })), [filters.data]);

  const currentCrmItems = crm.data?.crm[crmTab] ?? [];
  const kpis = intelligence.data?.kpis;
  const scores = intelligence.data?.scores ?? [];
  const insights = intelligence.data?.insights ?? [];
  const latestPlan = createPlan.data?.plan;

  async function handleCreatePlan() {
    try {
      await createPlan.mutateAsync({
        campaignId,
        territoryLevel,
        candidateId: candidateId || undefined,
        officeId: officeId || undefined,
        fieldWorkers,
        vehicles,
        budget,
        targetVotes
      });
      toast.success("Plano de rua gerado com alocação territorial.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar plano.");
    }
  }

  async function handleCreateCrm() {
    if (!quickName.trim()) {
      toast.error("Informe o nome ou título do registro.");
      return;
    }

    const base = {
      territoryLevel,
      name: quickName,
      title: quickName,
      objective: quickName,
      category: quickDetail || "Territorial",
      notes: quickDetail || undefined,
      description: quickDetail || undefined
    };

    try {
      await createCrm.mutateAsync(base);
      setQuickName("");
      setQuickDetail("");
      toast.success("Registro político salvo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar registro.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inteligência política e operação de rua</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
            Score territorial, distribuição de equipe, oportunidades e CRM político para coordenação real de campanha no Paraná.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(levelLabels) as IntelligenceLevel[]).map((level) => (
            <Button
              key={level}
              variant={territoryLevel === level ? "default" : "outline"}
              size="sm"
              onClick={() => {
                startTransition(() => {
                  setTerritoryLevel(level);
                });
              }}
            >
              <MapPinned data-icon="inline-start" />
              {levelLabels[level]}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Territórios analisados" value={formatNumber(kpis?.territories)} icon={Route} />
        <KpiCard label="Votos em oportunidade" value={formatNumber(kpis?.opportunityVotes)} icon={Target} />
        <KpiCard label="Áreas negligenciadas" value={formatNumber(kpis?.neglectedTerritories)} icon={ShieldAlert} />
        <KpiCard label="Lideranças mapeadas" value={formatNumber(kpis?.leaders)} icon={UsersRound} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr_360px]">
        <Card className="border-white/10 bg-white/[0.035]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="size-4" />
              Plano de Rua
            </CardTitle>
            <CardDescription>Distribuição de cabos, carros e verba por custo-benefício político.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SelectField label="Cargo" value={officeId} onChange={setOfficeId} options={officeOptions} />
            <SelectField label="Candidato-alvo" value={candidateId} onChange={setCandidateId} options={candidateOptions} />

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-2">
                <Label>Cabos eleitorais</Label>
                <Input type="number" value={fieldWorkers} onChange={(event) => setFieldWorkers(Number(event.target.value))} />
              </label>
              <label className="space-y-2">
                <Label>Carros</Label>
                <Input type="number" value={vehicles} onChange={(event) => setVehicles(Number(event.target.value))} />
              </label>
              <label className="space-y-2">
                <Label>Orçamento</Label>
                <Input type="number" value={budget} onChange={(event) => setBudget(Number(event.target.value))} />
              </label>
              <label className="space-y-2">
                <Label>Meta de votos</Label>
                <Input type="number" value={targetVotes} onChange={(event) => setTargetVotes(Number(event.target.value))} />
              </label>
            </div>

            <Button className="w-full" onClick={handleCreatePlan} disabled={createPlan.isPending}>
              <Zap data-icon="inline-start" />
              {createPlan.isPending ? "Calculando..." : "Gerar distribuição ideal"}
            </Button>

            {latestPlan ? (
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="text-xs text-muted-foreground">Resultado estimado</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <span>Votos previstos</span>
                  <strong className="text-right">{formatNumber(latestPlan.totals?.expectedVotes)}</strong>
                  <span>Cobertura da meta</span>
                  <strong className="text-right">{formatNumber(latestPlan.totals?.targetCoverage)}%</strong>
                  <span>Custo por voto</span>
                  <strong className="text-right">{formatCurrency(latestPlan.totals?.averageCostPerVote)}</strong>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="min-w-0 border-white/10 bg-white/[0.035]">
          <CardHeader className="border-b border-white/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Ranking territorial operacional</CardTitle>
                <CardDescription>Prioridade calculada por potencial, dificuldade, concorrência e cobertura de equipe.</CardDescription>
              </div>
              <Badge variant="success">Score real</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {intelligence.isLoading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : scores.length ? (
              <div className="content-auto max-h-[620px] overflow-auto">
                {scores.slice(0, 24).map((score, index) => (
                  <TerritoryRow key={score.territoryId} score={score} index={index} />
                ))}
              </div>
            ) : (
              <div className="p-6 text-sm leading-6 text-muted-foreground">
                Importe dados eleitorais e agregações territoriais para calcular scores operacionais.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.035]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="size-4" />
              IA estratégica
            </CardTitle>
            <CardDescription>Alertas e recomendações geradas a partir do score territorial e CRM.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.length ? insights.slice(0, 8).map((insight) => (
              <div key={`${insight.type}-${insight.territoryId}-${insight.title}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{insight.title}</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">{insight.description}</div>
                  </div>
                  <Badge variant={insight.severity === "HIGH" || insight.severity === "CRITICAL" ? "destructive" : "secondary"}>
                    {insight.severity}
                  </Badge>
                </div>
                <div className="mt-3 rounded-md bg-white/[0.04] p-2 text-xs leading-5">{insight.recommendation}</div>
              </div>
            )) : (
              <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm leading-6 text-muted-foreground">
                Os alertas aparecem assim que houver votos e alguma referencia territorial suficiente para leitura.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {latestPlan?.allocations?.length ? (
        <Card className="border-white/10 bg-white/[0.035]">
          <CardHeader>
            <CardTitle className="text-base">Distribuição sugerida</CardTitle>
            <CardDescription>Alocação calculada pelo algoritmo para a meta informada.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {latestPlan.allocations.slice(0, 9).map((allocation: Record<string, unknown>) => (
              <div key={String(allocation.id)} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="font-medium">{String(allocation.territoryName)}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Cabos</span><strong className="text-right text-foreground">{formatNumber(allocation.fieldWorkers as string)}</strong>
                  <span>Carros</span><strong className="text-right text-foreground">{formatNumber(allocation.vehicles as string)}</strong>
                  <span>Verba</span><strong className="text-right text-foreground">{formatCurrency(allocation.budget as string)}</strong>
                  <span>Votos esperados</span><strong className="text-right text-foreground">{formatNumber(allocation.expectedVotes as string)}</strong>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-white/10 bg-white/[0.035]">
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle className="text-base">CRM político e operação territorial</CardTitle>
              <CardDescription>Lideranças, apoiadores, visitas, eventos e demandas conectados ao score.</CardDescription>
            </div>
            <Badge variant="secondary">{formatNumber(currentCrmItems.length)} registros</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={crmTab} onValueChange={(value) => setCrmTab(value as typeof crmTab)}>
            <TabsList className="flex h-auto flex-wrap justify-start">
              <TabsTrigger value="leaders"><UserPlus data-icon="inline-start" /> Lideranças</TabsTrigger>
              <TabsTrigger value="supporters"><Vote data-icon="inline-start" /> Apoiadores</TabsTrigger>
              <TabsTrigger value="visits"><Route data-icon="inline-start" /> Visitas</TabsTrigger>
              <TabsTrigger value="events"><Megaphone data-icon="inline-start" /> Eventos</TabsTrigger>
              <TabsTrigger value="demands"><AlertTriangle data-icon="inline-start" /> Demandas</TabsTrigger>
            </TabsList>

            <div className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
              <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                <div className="grid gap-3">
                  <label className="space-y-2">
                    <Label>{crmTab === "demands" ? "Título" : crmTab === "visits" ? "Objetivo" : "Nome"}</Label>
                    <Input value={quickName} onChange={(event) => setQuickName(event.target.value)} />
                  </label>
                  <label className="space-y-2">
                    <Label>{crmTab === "demands" ? "Categoria" : "Observação"}</Label>
                    <Input value={quickDetail} onChange={(event) => setQuickDetail(event.target.value)} />
                  </label>
                  <Button onClick={handleCreateCrm} disabled={createCrm.isPending}>
                    <Flag data-icon="inline-start" />
                    Salvar no CRM
                  </Button>
                </div>
              </div>

              <TabsContent value={crmTab} className="mt-0">
                <div className="content-auto grid gap-2">
                  {currentCrmItems.length ? currentCrmItems.slice(0, 12).map((item) => (
                    <div key={String(item.id)} className="grid gap-2 rounded-lg border border-white/10 bg-black/20 p-3 md:grid-cols-[1fr_auto] md:items-center">
                      <div>
                        <div className="font-medium">{String(item.name ?? item.title ?? item.objective)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{String(item.notes ?? item.description ?? item.status ?? "Registro operacional")}</div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">{String(item.status ?? item.influence ?? "CRM")}</Badge>
                        {item.cost ? <span><BadgeDollarSign className="inline size-3" /> {formatCurrency(item.cost as string)}</span> : null}
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-lg border border-white/10 bg-black/20 p-6 text-sm leading-6 text-muted-foreground">
                      Nenhum registro ainda neste tipo. Cadastre dados reais de campo para aumentar a precisão da inteligência territorial.
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <KpiCard label="Apoiadores ativos" value={formatNumber(kpis?.supporters)} icon={Vote} />
        <KpiCard label="Visitas concluídas" value={formatNumber(kpis?.visitsCompleted)} icon={Route} />
        <KpiCard label="Demandas abertas" value={formatNumber(kpis?.openDemands)} icon={AlertTriangle} />
      </div>
    </div>
  );
}
