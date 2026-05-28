import { Building2, Database, FileText, MapPinned } from "lucide-react";
import { requireWorkspaceContext } from "@/lib/auth/workspace";
import { formatBytes, formatNumber } from "@/lib/utils";
import { getDashboardSnapshot } from "@/repositories/workspace-repository";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricCard } from "@/components/app/metric-card";

export default async function DashboardPage() {
  const workspace = await requireWorkspaceContext();
  const snapshot = await getDashboardSnapshot(workspace.campaign.id, workspace.organization.id);

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="relative p-6 md:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.18),transparent_35%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold tracking-normal md:text-4xl">
                Base eleitoral Paraná pronta para dados reais do TSE.
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground md:text-base">
                Estrutura multi-tenant preparada para importar votação por seção, consolidar Curitiba, São José dos Pinhais e Região Metropolitana e avançar para geometrias reais sem reescrever a base.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">Curitiba</Badge>
              <Badge variant="success">São José dos Pinhais</Badge>
              <Badge variant="secondary">RMC</Badge>
              <Badge variant="outline">PostGIS</Badge>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Municípios PR" value={formatNumber(snapshot.totals.municipalities)} detail="Base territorial Paraná" icon={Building2} />
        <MetricCard title="Zonas eleitorais" value={formatNumber(snapshot.totals.zones)} detail="Estrutura pronta para limites reais" icon={MapPinned} tone="accent" />
        <MetricCard title="Seções eleitorais" value={formatNumber(snapshot.totals.sections)} detail="Com local e endereço geocodificável" icon={Database} />
        <MetricCard title="Linhas importadas" value={formatNumber(snapshot.totals.rows)} detail={`${formatNumber(snapshot.totals.votes)} votos consolidados`} icon={FileText} tone="accent" />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
        <Card id="territorio">
          <CardHeader>
            <CardTitle>Prioridade territorial</CardTitle>
            <CardDescription>Organização regional inicial sem tentar cobrir o Brasil inteiro.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="curitiba" className="w-full">
              <TabsList>
                <TabsTrigger value="curitiba">Curitiba</TabsTrigger>
                <TabsTrigger value="sjp">SJP</TabsTrigger>
                <TabsTrigger value="rmc">RMC</TabsTrigger>
              </TabsList>
              <TabsContent value="curitiba" className="mt-5">
                <TerritoryPanel title="Curitiba" progress={92} items={["Bairros como camada geográfica prioritária", "Zonas 1, 2, 3, 4, 145, 174, 175, 176, 177 e 178", "Geocodificação por local de votação"]} />
              </TabsContent>
              <TabsContent value="sjp" className="mt-5">
                <TerritoryPanel title="São José dos Pinhais" progress={86} items={["Bairros e localidades urbanas/rurais", "Zona 199 como eixo inicial", "Endereços preparados para normalização"]} />
              </TabsContent>
              <TabsContent value="rmc" className="mt-5">
                <TerritoryPanel title="Região Metropolitana" progress={74} items={["Colombo, Araucária, Campo Largo, Fazenda Rio Grande e Almirante Tamandaré", "Municípios priorizados por volume eleitoral", "Agregações prontas para leitura regional"]} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card id="analises">
          <CardHeader>
            <CardTitle>Últimas importações</CardTitle>
            <CardDescription>Estado dos CSVs registrados para esta organização.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {snapshot.uploads.length === 0 ? (
              <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                Nenhum CSV importado ainda. Registre o arquivo do TSE em Importações TSE e processe pelo worker streaming.
              </div>
            ) : (
              snapshot.uploads.map((upload) => (
                <div key={upload.id} className="rounded-md border bg-background/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{upload.fileName}</div>
                      <div className="text-xs text-muted-foreground">{formatBytes(upload.fileSize)}</div>
                    </div>
                    <Badge variant={upload.status === "COMPLETED" ? "success" : "secondary"}>{upload.status}</Badge>
                  </div>
                  <Progress className="mt-3" value={upload.totalRows > 0 ? Math.round((upload.processedRows / upload.totalRows) * 100) : 0} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function TerritoryPanel({ title, progress, items }: { title: string; progress: number; items: string[] }) {
  return (
    <div className="rounded-lg border bg-background/60 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-medium">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">Preparação geoespacial do MVP</p>
        </div>
        <span className="font-mono text-sm text-primary">{progress}%</span>
      </div>
      <Progress className="mt-4" value={progress} />
      <ul className="mt-5 flex flex-col gap-3 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <span className="mt-2 size-1.5 rounded-full bg-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
