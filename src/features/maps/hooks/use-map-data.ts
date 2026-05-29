"use client";

import { useQuery } from "@tanstack/react-query";

export type ElectoralMapLevel = "MUNICIPALITY" | "NEIGHBORHOOD" | "ZONE" | "SECTION";
export type ElectoralMapMode = "heatmap" | "boundaries" | "clusters" | "compare";

export type ElectoralMapFilters = {
  campaignId: string;
  level: ElectoralMapLevel;
  electionYear?: number;
  round?: number;
  officeId?: string;
  candidateId?: string;
  compareCandidateId?: string;
  partyId?: string;
  municipalityId?: string;
  neighborhoodId?: string;
  zoneId?: string;
  sectionId?: string;
};

export type ElectoralFeatureProperties = {
  id: string;
  level: ElectoralMapLevel;
  name: string;
  municipalityName: string | null;
  zoneNumber: number | null;
  sectionNumber: number | null;
  votes: number;
  totalVotes: number;
  voteShare: number | null;
  compareVotes: number | null;
  compareVoteShare: number | null;
  shareDelta: number | null;
  previousVotes: number | null;
  previousVoteShare: number | null;
  growthVotes: number | null;
  growthShareDelta: number | null;
  dominantCandidateId: string | null;
  dominantCandidateName: string | null;
  dominantParty: string | null;
  dominantVotes: number | null;
  dominantVoteShare: number | null;
  potentialVotes: number;
  intensity: number;
};

export type ElectoralFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, ElectoralFeatureProperties> & {
  metadata: {
    campaignId: string;
    level: ElectoralMapLevel;
    filters: ElectoralMapFilters;
    bounds?: { west: number | null; south: number | null; east: number | null; north: number | null };
    maxVotes: number;
    generatedAt: string;
    emptyReason: string | null;
  };
};

export type MapFiltersResponse = {
  filters: {
    elections: Array<{ electionYear: number; electionCode: number; round: number }>;
    offices: Array<{ id: string; code: number; name: string }>;
    municipalities: Array<{ id: string; tseCode: number; ibgeCode: number | null; name: string; region: string | null; isPriority: boolean }>;
    zones: Array<{ id: string; number: number; municipality: { id: string; name: string; tseCode: number } }>;
    neighborhoods: Array<{ id: string; name: string; municipality: { id: string; name: string; tseCode: number } }>;
    candidates: Array<{
      id: string;
      name: string;
      ballotNumber: number;
      kind: string;
      office: { id: string; code: number; name: string } | null;
      party: { id: string; acronym: string; number: number | null } | null;
    }>;
  };
};

export function useAnalyticsFilters(campaignId: string) {
  return useQuery({
    queryKey: ["analytics-filters", campaignId],
    queryFn: async (): Promise<MapFiltersResponse> => {
      const response = await fetch(`/api/analytics/filters?campaignId=${campaignId}`);
      if (!response.ok) throw new Error("Falha ao carregar filtros.");
      return response.json();
    },
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000
  });
}

export function useElectoralGeoJson(filters: ElectoralMapFilters) {
  return useQuery({
    queryKey: ["map-geojson", filters],
    queryFn: async (): Promise<ElectoralFeatureCollection> => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== "") params.set(key, String(value));
      });

      const response = await fetch(`/api/maps/geojson?${params.toString()}`);
      if (!response.ok) throw new Error("Falha ao carregar mapa eleitoral.");
      return response.json();
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous
  });
}

export function useMapTimeseries(input: {
  campaignId: string;
  territoryLevel?: ElectoralMapLevel;
  territoryId?: string;
  candidateId?: string;
  officeId?: string;
}) {
  return useQuery({
    queryKey: ["map-timeseries", input],
    enabled: Boolean(input.territoryLevel && input.territoryId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("campaignId", input.campaignId);
      params.set("territoryLevel", input.territoryLevel!);
      params.set("territoryId", input.territoryId!);
      if (input.candidateId) params.set("candidateId", input.candidateId);
      if (input.officeId) params.set("officeId", input.officeId);

      const response = await fetch(`/api/maps/timeseries?${params.toString()}`);
      if (!response.ok) throw new Error("Falha ao carregar historico territorial.");
      return response.json() as Promise<{
        series: Array<{ election_year: number; round: number; votes: number; total_votes: number; vote_share: string | null }>;
      }>;
    },
    staleTime: 2 * 60_000,
    placeholderData: (previous) => previous
  });
}
