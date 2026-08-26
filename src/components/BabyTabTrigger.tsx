import { BabyProfile } from "@/types";
import { daysSince } from "@/lib/utils";
import { Baby, Droplets, Milk, Moon } from "lucide-react";

type BabyTabTriggerProps = {
  profile: BabyProfile;
  gaugePercents: {
    milk: number;
    diaper: number;
    sleep: number;
  };
  sleeping?: boolean;
};

const MiniGauge = ({
  percent,
  color,
  testId,
  children,
}: {
  percent: number;
  color: string;
  testId: string;
  children: React.ReactNode;
}) => {
  const normalizedPercent = Math.max(0, Math.min(100, percent));

  return (
    <span
      className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full"
      data-testid={testId}
      data-percent={normalizedPercent}
      style={{
        background: `conic-gradient(${color} ${normalizedPercent * 3.6}deg, rgb(71 85 105 / 0.45) 0deg)`,
      }}
      aria-hidden="true"
    >
      <span className="absolute inset-[3px] rounded-full bg-background" />
      <span className="relative text-foreground/80">{children}</span>
    </span>
  );
};

export function BabyTabTrigger({ profile, gaugePercents, sleeping = false }: BabyTabTriggerProps) {
  const p = profile;
  const ageDays = daysSince(p.birthDate);

  return (
    <div className="flex w-full min-w-0 items-center gap-1.5 px-0.5">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <div className="relative flex-shrink-0">
          <div
            className={`grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br ${
            p.iconGradient ?? "from-violet-500 to-fuchsia-500"
          }`}
          >
            {p.iconEmoji ? (
              <span className="text-xl">{p.iconEmoji}</span>
            ) : (
              <Baby className="h-4 w-4 text-white" />
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
          <p className="mt-0.5 truncate text-[10px] leading-none text-muted-foreground">生後{ageDays}日</p>
        </div>
      </div>
      <div
        className="flex shrink-0 items-center gap-1"
        aria-label={`${p.displayName}のミルク必要度${gaugePercents.milk}%・おむつ交換必要度${gaugePercents.diaper}%・活動時間経過${gaugePercents.sleep}%`}
      >
        <MiniGauge percent={gaugePercents.milk} color="#0ea5e9" testId={`baby-${p.babyId}-milk-mini-gauge`}>
          <Milk className="h-3 w-3" />
        </MiniGauge>
        <MiniGauge percent={gaugePercents.diaper} color="#f59e0b" testId={`baby-${p.babyId}-diaper-mini-gauge`}>
          <Droplets className="h-3 w-3" />
        </MiniGauge>
        <MiniGauge percent={gaugePercents.sleep} color="#8b5cf6" testId={`baby-${p.babyId}-sleep-mini-gauge`}>
          <Moon className="h-3 w-3" />
        </MiniGauge>
      </div>
    </div>
  );
}
