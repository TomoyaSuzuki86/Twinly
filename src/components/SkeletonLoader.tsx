import { Skeleton } from "@/components/ui/skeleton.tsx";

export function SkeletonLoader() {
  return (
    <div className="mx-auto max-w-7xl p-2 sm:p-4">
      {/* Header Skeleton */}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-12 w-48" /> {/* App Title */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-10 rounded-full" /> {/* User Avatar */}
            <Skeleton className="h-10 w-10 rounded-full" /> {/* Settings Button */}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-24" /> {/* Date Label */}
          <Skeleton className="h-10 w-32" /> {/* Date Input */}
          <Skeleton className="h-10 w-20" /> {/* Today Button */}
        </div>
      </div>

      {/* Tabs Skeleton */}
      <div className="mb-4 grid h-12 w-full grid-cols-2 gap-2">
        <Skeleton className="h-full w-full" />
        <Skeleton className="h-full w-full" />
      </div>

      {/* BabyPanel Skeleton */}
      <div className="rounded-xl border bg-card p-4">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Skeleton className="h-24 w-full" /> {/* Milk Button */}
          <Skeleton className="h-24 w-full" /> {/* Diaper Button */}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <Skeleton className="h-10 w-full" /> {/* Temp Input */}
          <Skeleton className="h-10 w-full" /> {/* Weight Input */}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24 w-full" /> {/* Milk Total Card */}
          <Skeleton className="h-24 w-full" /> {/* Diaper Count Card */}
        </div>
        <div className="space-y-3 mt-4">
          <Skeleton className="h-6 w-32" /> {/* Today's Log Title */}
          <Skeleton className="h-20 w-full" /> {/* Event Card 1 */}
          <Skeleton className="h-20 w-full" /> {/* Event Card 2 */}
        </div>
      </div>
    </div>
  );
}