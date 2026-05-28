import { ElectoralMapLoader } from "@/features/maps/components/electoral-map-loader";
import { requireWorkspaceContext } from "@/lib/auth/workspace";

export default async function MapsPage() {
  const workspace = await requireWorkspaceContext();

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sistema de mapas eleitorais</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Visualização geoespacial por municípios, bairros, zonas e seções usando geometrias reais do PostGIS.
          </p>
        </div>
      </div>
      <ElectoralMapLoader
        campaignId={workspace.campaign.id}
        mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}
      />
    </div>
  );
}
