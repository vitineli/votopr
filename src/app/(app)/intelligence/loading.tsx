import { Skeleton } from "@/components/ui/skeleton";

export default function IntelligenceLoading() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-5 w-full max-w-3xl" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[360px_1fr_360px]">
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[420px]" />
      </div>
      <Skeleton className="h-[360px]" />
    </div>
  );
}
