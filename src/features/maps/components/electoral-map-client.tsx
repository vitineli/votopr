"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import mapboxgl, { type GeoJSONSource, type MapLayerMouseEvent } from "mapbox-gl";
import {
  Activity,
  BarChart3,
  Building2,
  ChevronDown,
  Crosshair,
  GitCompare,
  Layers3,
  Loader2,
  MapPinned,
  RadioTower,
  Search,
  SlidersHorizontal,
  TrendingUp,
  UsersRound,
  Vote
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMapStore } from "@/stores/map-store";
import {
  type ElectoralFeatureProperties,
  type ElectoralFeatureCollection,
  type ElectoralMapFilters,
  type ElectoralMapLevel,
  type ElectoralMapMode,
  useAnalyticsFilters,
  useElectoralGeoJson,
  useMapTimeseries
} from "@/features/maps/hooks/use-map-data";

const PARANA_CENTER: [number, number] = [-49.2733, -25.4284];

const OSM_RASTER_STYLE = {
  version: 8,
  sources: {
    "osm-base": {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
      ],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors"
    }
  },
  layers: [
    {
      id: "osm-base",
      type: "raster",
      source: "osm-base",
      paint: {
        "raster-opacity": 0.86,
        "raster-saturation": -0.45,
        "raster-contrast": 0.18,
        "raster-brightness-min": 0.18,
        "raster-brightness-max": 0.9
      }
    }
  ]
} as mapboxgl.StyleSpecification;

function applyMapData(
  map: mapboxgl.Map,
  data: ElectoralFeatureCollection,
  mode: ElectoralMapMode
) {
  upsertMapLayers(map);
  const source = map.getSource("electoral") as GeoJSONSource | undefined;
  source?.setData(data);
  applyLayerVisibility(map, mode);
  fitMapToBounds(map, data.metadata?.bounds);
}

const levelLabels: Record<ElectoralMapLevel, string> = {
  MUNICIPALITY: "Municípios",
  NEIGHBORHOOD: "Bairros",
  ZONE: "Zonas",
  SECTION: "Seções"
};

const modeLabels: Record<ElectoralMapMode, string> = {
  heatmap: "Heatmap",
  boundaries: "Territórios",
  clusters: "Clusters",
  compare: "Comparar"
};

type SelectOption = {
  value: string;
  label: string;
  description?: string;
};

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "sem dado";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
  icon: Icon
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {Icon ? <Icon className="size-3.5" /> : null}
        {label}
      </span>
      <span className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full appearance-none rounded-md border border-white/10 bg-black/25 px-3 pr-9 text-sm text-foreground outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Todos</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </span>
    </label>
  );
}

function modeToMapLayers(mode: ElectoralMapMode) {
  return {
    heatmap: mode === "heatmap",
    polygons: mode === "boundaries" || mode === "compare",
    clusters: mode === "clusters"
  };
}

function upsertMapLayers(map: mapboxgl.Map) {
  if (!map.getSource("electoral")) {
    map.addSource("electoral", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    });
  }

  if (!map.getLayer("electoral-heat")) {
    map.addLayer({
      id: "electoral-heat",
      type: "heatmap",
      source: "electoral",
      maxzoom: 14,
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "votes"], 0, 0, 500, 0.15, 3000, 0.5, 20000, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 6, 0.55, 11, 1.35, 14, 2.1],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(8, 13, 18, 0)",
          0.18,
          "rgba(6, 182, 212, 0.35)",
          0.42,
          "rgba(20, 184, 166, 0.58)",
          0.68,
          "rgba(245, 158, 11, 0.74)",
          0.9,
          "rgba(239, 68, 68, 0.92)"
        ],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 6, 18, 10, 34, 14, 58],
        "heatmap-opacity": 0.9
      }
    });
  }

  if (!map.getLayer("electoral-fill")) {
    map.addLayer({
      id: "electoral-fill",
      type: "fill",
      source: "electoral",
      filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
      paint: {
        "fill-color": [
          "case",
          [">", ["coalesce", ["get", "shareDelta"], 0], 4],
          "#14b8a6",
          ["<", ["coalesce", ["get", "shareDelta"], 0], -4],
          "#ef4444",
          [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "voteShare"], 0],
            0,
            "#0f172a",
            15,
            "#0e7490",
            35,
            "#14b8a6",
            55,
            "#f59e0b",
            75,
            "#ef4444"
          ]
        ],
        "fill-opacity": ["interpolate", ["linear"], ["coalesce", ["get", "votes"], 0], 0, 0.22, 25000, 0.74],
        "fill-outline-color": "rgba(255,255,255,0.16)"
      }
    });
  }

  if (!map.getLayer("electoral-outline")) {
    map.addLayer({
      id: "electoral-outline",
      type: "line",
      source: "electoral",
      filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
      paint: {
        "line-color": "rgba(226,232,240,0.45)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.35, 12, 1.1],
        "line-opacity": 0.8
      }
    });
  }

  if (!map.getLayer("electoral-points")) {
    map.addLayer({
      id: "electoral-points",
      type: "circle",
      source: "electoral",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "votes"], 0, 4, 1000, 7, 10000, 14],
        "circle-color": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "voteShare"], 0],
          0,
          "#0891b2",
          35,
          "#14b8a6",
          55,
          "#f59e0b",
          75,
          "#ef4444"
        ],
        "circle-stroke-width": 1.4,
        "circle-stroke-color": "rgba(255,255,255,0.75)",
        "circle-opacity": 0.85
      }
    });
  }

  if (!map.getLayer("electoral-clusters")) {
    map.addLayer({
      id: "electoral-clusters",
      type: "circle",
      source: "electoral",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": ["step", ["get", "point_count"], "#0891b2", 25, "#14b8a6", 100, "#f59e0b", 400, "#ef4444"],
        "circle-radius": ["step", ["get", "point_count"], 16, 25, 22, 100, 28, 400, 36],
        "circle-stroke-color": "rgba(255,255,255,0.72)",
        "circle-stroke-width": 1.5
      }
    });
  }

  if (!map.getLayer("electoral-cluster-count")) {
    map.addLayer({
      id: "electoral-cluster-count",
      type: "symbol",
      source: "electoral",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 11
      },
      paint: {
        "text-color": "#f8fafc"
      }
    });
  }
}

function applyLayerVisibility(map: mapboxgl.Map, mode: ElectoralMapMode) {
  const visible = modeToMapLayers(mode);
  const set = (layer: string, shouldShow: boolean) => {
    if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", shouldShow ? "visible" : "none");
  };

  set("electoral-heat", visible.heatmap);
  set("electoral-fill", visible.polygons || visible.heatmap || visible.clusters);
  set("electoral-outline", visible.polygons || visible.heatmap || visible.clusters);
  set("electoral-points", false);
  set("electoral-clusters", false);
  set("electoral-cluster-count", false);
}

function fitMapToBounds(map: mapboxgl.Map, bounds?: { west: number | null; south: number | null; east: number | null; north: number | null }) {
  if (bounds?.west === null || bounds?.west === undefined || bounds.south === null || bounds.south === undefined || bounds.east === null || bounds.east === undefined || bounds.north === null || bounds.north === undefined) {
    return;
  }

  map.fitBounds(
    [
      [bounds.west, bounds.south],
      [bounds.east, bounds.north]
    ],
    { padding: 72, duration: 900, maxZoom: 13 }
  );
}

function InsightPanel({
  selected,
  campaignId,
  filters
}: {
  selected: ElectoralFeatureProperties | null;
  campaignId: string;
  filters: ElectoralMapFilters;
}) {
  const timeseries = useMapTimeseries({
    campaignId,
    territoryLevel: selected?.level,
    territoryId: selected?.id,
    candidateId: filters.candidateId,
    officeId: filters.officeId
  });

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-white/10 bg-[#090d12]/92 backdrop-blur-xl lg:w-[360px]">
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Inspector territorial</div>
            <h2 className="mt-1 text-lg font-semibold">{selected?.name ?? "Selecione uma região"}</h2>
          </div>
          <Badge variant={selected ? "success" : "secondary"}>{selected ? selected.level : "sem seleção"}</Badge>
        </div>
      </div>

      {selected ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Votos" value={formatNumber(selected.votes)} icon={Vote} />
            <Metric label="Share" value={formatPercent(selected.voteShare)} icon={Activity} />
            <Metric label="Potencial" value={formatNumber(selected.potentialVotes)} icon={TrendingUp} />
            <Metric label="Delta" value={selected.shareDelta === null ? "sem comp." : formatPercent(selected.shareDelta)} icon={GitCompare} />
          </div>

          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Candidato dominante</div>
                <div className="mt-1 text-sm font-semibold">{selected.dominantCandidateName ?? "Sem dados"}</div>
                <div className="mt-1 text-xs text-muted-foreground">{selected.dominantParty ?? "Partido não informado"}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">{formatNumber(selected.dominantVotes)}</div>
                <div className="text-xs text-muted-foreground">{formatPercent(selected.dominantVoteShare)}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">Evolução eleitoral</div>
              <Badge variant="secondary">histórico</Badge>
            </div>
            {timeseries.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : timeseries.data?.series.length ? (
              <div className="space-y-2">
                {timeseries.data.series.map((point) => (
                  <div key={`${point.election_year}-${point.round}`} className="flex items-center justify-between rounded-md bg-black/20 px-3 py-2 text-xs">
                    <span>{point.election_year} · {point.round}º turno</span>
                    <span className="font-medium">{formatNumber(point.votes)} · {formatPercent(point.vote_share ? Number(point.vote_share) : null)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                A série aparece quando houver eleições anteriores importadas para o mesmo recorte territorial.
              </p>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <div className="text-sm font-medium">Leitura de campanha</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {selected.shareDelta !== null
                ? selected.shareDelta >= 0
                  ? "Território favorável na comparação selecionada. Priorize manutenção, presença local e proteção de voto."
                  : "Território abaixo do candidato comparado. Útil para agenda territorial, reforço de mensagem e busca de lideranças locais."
                : "Use o modo Comparar com dois candidatos para estimar vantagem, fraqueza relativa e potencial operacional."}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm leading-6 text-muted-foreground">
          Clique em um polígono, cluster ou seção para abrir votos, dominância, comparação e histórico.
        </div>
      )}
    </aside>
  );
}

function Metric({
  label,
  value,
  icon: Icon
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {label}
        <Icon className="size-3.5" />
      </div>
      <div className="mt-2 truncate text-lg font-semibold">{value}</div>
    </div>
  );
}

export function ElectoralMapClient({
  campaignId,
  mapboxToken
}: {
  campaignId: string;
  mapboxToken?: string;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const { mode, level, setMode, setLevel } = useMapStore();
  const [filters, setFilters] = useState<Omit<ElectoralMapFilters, "campaignId" | "level">>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<ElectoralFeatureProperties | null>(null);
  const deferredFilters = useDeferredValue(filters);
  const deferredLevel = useDeferredValue(level);
  const deferredSearchTerm = useDeferredValue(searchTerm.trim().toLowerCase());
  const filterData = useAnalyticsFilters(campaignId);
  const geoJson = useElectoralGeoJson({ campaignId, level: deferredLevel, ...deferredFilters });

  const elections = filterData.data?.filters.elections ?? [];
  const latestElection = elections[0];

  useEffect(() => {
    if (!filters.electionYear && latestElection) {
      setFilters((current) => ({
        ...current,
        electionYear: latestElection.electionYear,
        round: latestElection.round
      }));
    }
  }, [filters.electionYear, latestElection]);

  const options = useMemo(() => {
    const data = filterData.data?.filters;

    return {
      offices: data?.offices.map((office) => ({ value: office.id, label: office.name })) ?? [],
      municipalities: data?.municipalities.map((municipality) => ({
        value: municipality.id,
        label: municipality.name,
        description: municipality.region ?? undefined
      })) ?? [],
      neighborhoods: data?.neighborhoods.map((neighborhood) => ({
        value: neighborhood.id,
        label: `${neighborhood.name} · ${neighborhood.municipality.name}`
      })) ?? [],
      zones: data?.zones.map((zone) => ({ value: zone.id, label: `${zone.municipality.name} · Zona ${zone.number}` })) ?? [],
      candidates: data?.candidates.map((candidate) => ({
        value: candidate.id,
        label: `${candidate.ballotNumber} · ${candidate.name}${candidate.party?.acronym ? ` · ${candidate.party.acronym}` : ""}`
      })) ?? [],
      parties: Array.from(
        new Map(
          (data?.candidates ?? [])
            .filter((candidate) => candidate.party)
            .map((candidate) => [candidate.party!.id, {
              value: candidate.party!.id,
              label: `${candidate.party!.acronym}${candidate.party!.number ? ` · ${candidate.party!.number}` : ""}`
            }])
        ).values()
      )
    };
  }, [filterData.data]);

  const filteredOptions = useMemo(() => {
    if (!deferredSearchTerm) return options;

    const matches = (option: SelectOption) => {
      const haystack = `${option.label} ${option.description ?? ""}`.toLowerCase();
      return haystack.includes(deferredSearchTerm);
    };

    return {
      offices: options.offices.filter(matches),
      municipalities: options.municipalities.filter(matches),
      neighborhoods: options.neighborhoods.filter(matches),
      zones: options.zones.filter(matches),
      candidates: options.candidates.filter(matches),
      parties: options.parties.filter(matches)
    };
  }, [deferredSearchTerm, options]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    if (mapboxToken) {
      mapboxgl.accessToken = mapboxToken;
    }

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: mapboxToken ? "mapbox://styles/mapbox/dark-v11" : OSM_RASTER_STYLE,
      center: PARANA_CENTER,
      zoom: 8.4,
      attributionControl: false,
      cooperativeGestures: true
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true, showCompass: false }), "bottom-right");
    if (mapboxToken) {
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
    }

    map.on("load", () => {
      upsertMapLayers(map);
      applyLayerVisibility(map, useMapStore.getState().mode);

      const onClick = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature?.properties) return;
        setSelected(feature.properties as ElectoralFeatureProperties);
      };

      ["electoral-fill", "electoral-points", "electoral-clusters"].forEach((layer) => {
        map.on("click", layer, onClick);
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mapboxToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geoJson.data) return;

    if (!map.isStyleLoaded()) {
      map.once("load", () => applyMapData(map, geoJson.data, mode));
      return;
    }

    applyMapData(map, geoJson.data, mode);
  }, [geoJson.data, mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyLayerVisibility(map, mode);
  }, [mode]);

  function updateFilter<K extends keyof typeof filters>(key: K, value: (typeof filters)[K] | "") {
    startTransition(() => {
      setSelected(null);
      setFilters((current) => ({
        ...current,
        [key]: value || undefined
      }));
    });
  }

  return (
    <div className="min-h-[calc(100vh-6.5rem)] overflow-hidden rounded-lg border border-white/10 bg-[#070a0e] shadow-soft-border lg:h-[calc(100vh-6.5rem)]">
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        <aside className="flex max-h-[44vh] shrink-0 flex-col border-b border-white/10 bg-[#090d12]/95 backdrop-blur-xl lg:max-h-none lg:w-[318px] lg:border-b-0 lg:border-r">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold">Mapa eleitoral</h1>
                <p className="mt-1 text-xs text-muted-foreground">Curitiba · São José dos Pinhais · RMC</p>
              </div>
              <Badge variant="success">PostGIS</Badge>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="space-y-4">
              <div>
                <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Modo de leitura</Label>
                <Tabs
                  value={mode}
                  onValueChange={(value) => {
                    startTransition(() => {
                      setSelected(null);
                      setMode(value as ElectoralMapMode);
                    });
                  }}
                  className="mt-2"
                >
                  <TabsList className="grid h-auto grid-cols-2 bg-black/30 p-1">
                    {Object.entries(modeLabels).map(([value, label]) => (
                      <TabsTrigger key={value} value={value} className="text-xs">
                        {label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {Object.entries(levelLabels).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={level === value ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      startTransition(() => {
                        setSelected(null);
                        setLevel(value as ElectoralMapLevel);
                      });
                    }}
                    className="justify-start"
                  >
                    <Layers3 data-icon="inline-start" />
                    {label}
                  </Button>
                ))}
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Filtrar listas por território ou candidato"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>

              <SelectField
                label="Cargo"
                value={filters.officeId ?? ""}
                options={filteredOptions.offices}
                onChange={(value) => updateFilter("officeId", value)}
                icon={Building2}
              />
              <SelectField
                label="Candidato"
                value={filters.candidateId ?? ""}
                options={filteredOptions.candidates}
                onChange={(value) => updateFilter("candidateId", value)}
                icon={UsersRound}
              />
              <SelectField
                label="Comparar com"
                value={filters.compareCandidateId ?? ""}
                options={filteredOptions.candidates}
                onChange={(value) => updateFilter("compareCandidateId", value)}
                icon={GitCompare}
              />
              <SelectField
                label="Partido"
                value={filters.partyId ?? ""}
                options={filteredOptions.parties}
                onChange={(value) => updateFilter("partyId", value)}
                icon={Vote}
              />
              <SelectField
                label="Município"
                value={filters.municipalityId ?? ""}
                options={filteredOptions.municipalities}
                onChange={(value) => updateFilter("municipalityId", value)}
                icon={MapPinned}
              />
              <SelectField
                label="Bairro"
                value={filters.neighborhoodId ?? ""}
                options={filteredOptions.neighborhoods}
                onChange={(value) => updateFilter("neighborhoodId", value)}
                icon={Crosshair}
              />
              <SelectField
                label="Zona eleitoral"
                value={filters.zoneId ?? ""}
                options={filteredOptions.zones}
                onChange={(value) => updateFilter("zoneId", value)}
                icon={RadioTower}
              />
            </div>
          </div>
        </aside>

        <section className="relative min-h-[420px] flex-1 bg-black">
          <div className="absolute left-4 right-4 top-4 z-10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-[#090d12]/88 p-2 backdrop-blur-xl">
              <Badge variant="secondary">{levelLabels[deferredLevel]}</Badge>
              <Badge variant="secondary">{modeLabels[mode]}</Badge>
              <Badge variant="outline">{mapboxToken ? "Mapbox" : "OpenStreetMap"}</Badge>
              <Badge variant={geoJson.data?.features.length ? "success" : "secondary"}>
                {formatNumber(geoJson.data?.features.length ?? 0)} geometrias
              </Badge>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#090d12]/88 p-2 backdrop-blur-xl">
              <Button variant="ghost" size="sm" onClick={() => mapRef.current?.flyTo({ center: PARANA_CENTER, zoom: 8.4 })}>
                <Crosshair data-icon="inline-start" />
                Centralizar
              </Button>
              <Button variant="ghost" size="sm" disabled={!geoJson.data} onClick={() => fitMapToBounds(mapRef.current!, geoJson.data?.metadata.bounds)}>
                <SlidersHorizontal data-icon="inline-start" />
                Ajustar
              </Button>
            </div>
          </div>

          <div ref={mapContainerRef} className="absolute inset-0" />
          {geoJson.isFetching || filterData.isLoading ? (
            <div className="absolute inset-x-4 bottom-4 z-10 flex items-center gap-3 rounded-lg border border-white/10 bg-[#090d12]/90 p-3 text-sm text-muted-foreground backdrop-blur-xl">
              <Loader2 className="size-4 animate-spin text-primary" />
              Carregando geometrias e agregações eleitorais...
            </div>
          ) : null}

          {!geoJson.isFetching && geoJson.data?.features.length === 0 ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/35 p-6 backdrop-blur-[1px]">
              <div className="max-w-lg rounded-lg border border-white/10 bg-[#090d12]/92 p-6 text-center shadow-soft-border">
                <MapPinned className="mx-auto size-10 text-primary" />
                <h2 className="mt-4 text-lg font-semibold">Sem geometrias reais para este recorte</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Importe GeoJSON real de municípios, bairros, zonas ou seções e reconstrua as agregações. O mapa não renderiza polígonos falsos.
                </p>
              </div>
            </div>
          ) : null}

          <div className="pointer-events-none absolute bottom-4 left-4 z-10 hidden rounded-lg border border-white/10 bg-[#090d12]/88 p-3 backdrop-blur-xl md:block">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <BarChart3 className="size-3.5" />
              Intensidade eleitoral
            </div>
            <div className="h-2 w-56 rounded-full bg-gradient-to-r from-cyan-700 via-teal-400 via-amber-400 to-red-500" />
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span>fraco</span>
              <span>forte</span>
            </div>
          </div>
        </section>

        <InsightPanel selected={selected} campaignId={campaignId} filters={{ campaignId, level, ...filters }} />
      </div>
    </div>
  );
}

export default ElectoralMapClient;
