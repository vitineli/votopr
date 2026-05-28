import { Skeleton } from "@/components/ui/skeleton";

export default function MapsLoading() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div className="min-h-[calc(100vh-6.5rem)] overflow-hidden rounded-lg border border-white/10 bg-[#070a0e] p-4 shadow-soft-border lg:h-[calc(100vh-6.5rem)]">
        <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
          <Skeleton className="h-52 lg:h-full lg:w-[318px]" />
          <Skeleton className="min-h-[360px] flex-1 lg:h-full" />
          <Skeleton className="h-40 lg:h-full lg:w-[360px]" />
        </div>
      </div>
    </div>
  );
}
