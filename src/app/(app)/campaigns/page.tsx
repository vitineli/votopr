import { CalendarDays, MapPinned, Shield } from "lucide-react";
import { requireWorkspaceContext } from "@/lib/auth/workspace";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CampaignsPage() {
  const workspace = await requireWorkspaceContext();

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle>Campanhas</CardTitle>
          <CardDescription>Base multi-tenant preparada para múltiplas operações eleitorais dentro da mesma organização.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-background/60 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{workspace.campaign.name}</h2>
                  <Badge variant="success">Ativa</Badge>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Campanha inicial focada em Paraná, com escopo regional pronto para Curitiba, São José dos Pinhais e Região Metropolitana.
                </p>
              </div>
              <Badge variant="outline">{workspace.organization.name}</Badge>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
              <Info icon={CalendarDays} label="Ano eleitoral" value={String(workspace.campaign.electionYear)} />
              <Info icon={MapPinned} label="Estado" value="Paraná" />
              <Info icon={Shield} label="Modelo" value="Multi-tenant" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diretriz MVP</CardTitle>
          <CardDescription>O produto permanece Paraná-first nesta fase.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>Não há suporte nacional genérico neste ponto da arquitetura.</p>
          <p>As próximas camadas naturais são geometrias de bairros, locais de votação geocodificados e materialized views por zona/seção.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <Icon className="text-primary" />
      <div className="mt-3 text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
