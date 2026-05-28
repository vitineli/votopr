"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const ElectoralMapClient = dynamic(() => import("@/features/maps/components/electoral-map-client"), {
  ssr: false,
  loading: () => (
    <div className="min-h-[calc(100vh-6.5rem)] overflow-hidden rounded-lg border border-white/10 bg-[#070a0e] p-4 shadow-soft-border lg:h-[calc(100vh-6.5rem)]">
      <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
        <Skeleton className="h-48 lg:h-full lg:w-[318px]" />
        <Skeleton className="min-h-[360px] flex-1 lg:h-full" />
        <Skeleton className="h-40 lg:h-full lg:w-[360px]" />
      </div>
    </div>
  )
});

export function ElectoralMapLoader({
  campaignId,
  mapboxToken
}: {
  campaignId: string;
  mapboxToken?: string;
}) {
  return <ElectoralMapClient campaignId={campaignId} mapboxToken={mapboxToken} />;
}
