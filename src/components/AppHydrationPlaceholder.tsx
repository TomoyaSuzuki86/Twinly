import { Droplets, Moon, Utensils } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function BabyTabHydrationPlaceholder({ selected }: { selected: boolean }) {
  return (
    <div className="flex min-h-14 w-full min-w-0 items-center gap-1" aria-busy="true" aria-label="赤ちゃん情報を読み込み中">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5 text-left">
          <Skeleton className="h-3.5 w-16 max-w-full" />
          {selected ? <Skeleton className="h-2.5 w-12" /> : null}
        </div>
      </div>
      {!selected ? (
        <div className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
          <Skeleton className="h-11 w-11 rounded-full" />
          <Skeleton className="h-11 w-11 rounded-full" />
          <Skeleton className="h-11 w-11 rounded-full" />
        </div>
      ) : null}
    </div>
  );
}

const CareActionPlaceholder = ({
  icon,
  label,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  className?: string;
}) => (
  <div className={`flex flex-col items-center justify-start rounded-md border p-0 pt-5 ${className ?? ""}`}>
    <div className="flex items-center text-lg font-bold">
      {icon}
      {label}
    </div>
    <Skeleton className="mt-2 h-3 w-24" />
    <Skeleton className="mt-1.5 h-3 w-32 max-w-[80%]" />
  </div>
);

export function BabyPanelHydrationPlaceholder() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="赤ちゃんの記録を読み込み中">
      <div className="grid grid-cols-2 gap-2">
        <CareActionPlaceholder
          icon={<Utensils className="mr-3 h-7 w-7" />}
          label="食事"
          className="h-28 [background:hsl(var(--gauge-milk-track))] [color:hsl(var(--gauge-milk-text))]"
        />
        <CareActionPlaceholder
          icon={<Droplets className="mr-3 h-7 w-7" />}
          label="おむつ"
          className="h-28 [background:hsl(var(--gauge-diaper-track))] [color:hsl(var(--gauge-diaper-text))]"
        />
      </div>
      <div className="flex h-20 w-full flex-col items-center justify-center rounded-md border bg-card">
        <div className="flex items-center text-lg font-bold">
          <Moon className="mr-3 h-6 w-6" />
          睡眠
        </div>
        <Skeleton className="mt-2 h-3 w-28" />
      </div>
      <div className="rounded-xl border bg-card p-3">
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="mt-3 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    </div>
  );
}
