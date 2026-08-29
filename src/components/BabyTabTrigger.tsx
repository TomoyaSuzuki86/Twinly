import { BabyProfile } from "@/types";
import { daysSince } from "@/lib/utils";
import { Baby, Droplets, Milk, Moon, Sun } from "lucide-react";

type BabyTabTriggerProps = {
  profile: BabyProfile;
  gaugePercents: {
    milk: number;
    diaper: number;
    activity: number;
  };
  activityGaugeEnabled?: boolean;
  sleeping?: boolean;
  selected?: boolean;
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
  const isFull = normalizedPercent >= 100;

  return (
    <span
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full"
      data-testid={testId}
      data-percent={normalizedPercent}
      data-full={isFull}
      style={{
        background: `conic-gradient(${color} ${normalizedPercent * 3.6}deg, rgb(71 85 105 / 0.45) 0deg)`,
      }}
      aria-hidden="true"
    >
      <span
        className="absolute inset-[5px] rounded-full bg-background transition-colors"
        style={isFull ? { backgroundColor: color } : undefined}
      />
      <span className={`relative transition-colors ${isFull ? "text-white" : "text-foreground/80"}`}>
        {children}
      </span>
    </span>
  );
};

export function BabyTabTrigger({
  profile,
  gaugePercents,
  activityGaugeEnabled = true,
  sleeping = false,
  selected = false,
}: BabyTabTriggerProps) {
  const p = profile;
  const ageDays = daysSince(p.birthDate);

  return (
    <div className="flex min-h-14 w-full min-w-0 items-center gap-1 px-0">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <div className="relative flex-shrink-0">
          <div
            className={`grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br transition-[filter] ${
            p.iconGradient ?? "from-violet-500 to-fuchsia-500"
          } ${selected ? "" : "brightness-50"}`}
          >
            {p.iconEmoji ? (
              <span className="text-2xl">{p.iconEmoji}</span>
            ) : (
              <Baby className="h-4 w-4 text-white" />
            )}
          </div>
          {sleeping && !selected ? (
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
          {selected ? (
            <p className="mt-1 truncate text-[11px] leading-none text-muted-foreground">生後{ageDays}日</p>
          ) : null}
        </div>
      </div>
      {!selected ? (
        <div
          className="flex shrink-0 items-center gap-0.5"
          aria-label={`${p.displayName}のミルク必要度${gaugePercents.milk}%・おむつ交換必要度${gaugePercents.diaper}%${
            activityGaugeEnabled ? `・活動時間経過${gaugePercents.activity}%` : ""
          }`}
        >
          <MiniGauge percent={gaugePercents.milk} color="#0ea5e9" testId={`baby-${p.babyId}-milk-mini-gauge`}>
            <Milk className="h-5 w-5" />
          </MiniGauge>
          <MiniGauge percent={gaugePercents.diaper} color="#f59e0b" testId={`baby-${p.babyId}-diaper-mini-gauge`}>
            <Droplets className="h-5 w-5" />
          </MiniGauge>
          {activityGaugeEnabled ? (
            <MiniGauge
              percent={gaugePercents.activity}
              color="#22c55e"
              testId={`baby-${p.babyId}-activity-mini-gauge`}
            >
              <Sun className="h-5 w-5" />
            </MiniGauge>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
