import { BabyProfile } from "@/types";
import { daysSince } from "@/lib/utils";
import { Baby, Moon } from "lucide-react";

type BabyTabTriggerProps = {
  profile: BabyProfile;
  careGaugePercents?: {
    milk: number;
    diaper: number;
  };
  sleeping?: boolean;
};

export function BabyTabTrigger({ profile, careGaugePercents, sleeping = false }: BabyTabTriggerProps) {
  const p = profile;
  const ageDays = daysSince(p.birthDate);

  return (
    <div className="flex w-full min-w-0 flex-col p-2">
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <div
            className={`grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br ${
            p.iconGradient ?? "from-violet-500 to-fuchsia-500"
          }`}
          >
            {p.iconEmoji ? (
              <span className="text-3xl">{p.iconEmoji}</span>
            ) : (
              <Baby className="h-7 w-7 text-white" />
            )}
          </div>
          {sleeping ? (
            <span
              className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-indigo-200 bg-indigo-700 text-white shadow"
              aria-label={`${p.displayName}は睡眠中`}
              title="睡眠中"
            >
              <Moon className="h-3 w-3" />
            </span>
          ) : null}
        </div>
        <div className="min-w-0 text-left">
          <p className="truncate font-semibold leading-none tracking-tight">{p.displayName}</p>
          <p className="mt-1 text-sm text-muted-foreground">生後{ageDays}日</p>
        </div>
      </div>
      {careGaugePercents ? (
        <div
          className="mt-2 grid grid-cols-2 gap-1.5"
          aria-label={`${p.displayName}のミルク必要度${careGaugePercents.milk}%・おむつ交換必要度${careGaugePercents.diaper}%`}
        >
          <span className="h-2 overflow-hidden rounded-full bg-sky-950/60" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-sky-500 transition-[width] duration-500"
              data-testid={`baby-${p.babyId}-milk-mini-gauge`}
              style={{ width: `${careGaugePercents.milk}%` }}
            />
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-amber-950/60" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-amber-500 transition-[width] duration-500"
              data-testid={`baby-${p.babyId}-diaper-mini-gauge`}
              style={{ width: `${careGaugePercents.diaper}%` }}
            />
          </span>
        </div>
      ) : (
        <div className="mt-2 h-2" aria-hidden="true" />
      )}
    </div>
  );
}
