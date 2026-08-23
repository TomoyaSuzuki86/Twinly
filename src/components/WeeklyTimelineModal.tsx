import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BabyId, BabyProfile, LogEvent } from "@/types";
import { fmtTime, iconGradients } from "@/lib/utils";
import {
  buildWeeklyTimeline,
  getWeekEnd,
  getWeekStart,
  shiftWeek,
} from "@/lib/weekly-timeline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type WeeklyTimelineModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: LogEvent[];
  profiles: Record<BabyId, BabyProfile>;
  initialDate: string;
  initialBabyId: BabyId;
  now: Date;
};

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
const hourTicks = Array.from({ length: 9 }, (_, index) => index * 3);

const formatShortDate = (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`;

const formatWeekLabel = (weekStart: Date) => {
  const end = getWeekEnd(weekStart);
  return `${formatShortDate(weekStart)}〜${formatShortDate(end)}`;
};

const getBabyGradient = (profile: BabyProfile) =>
  iconGradients.find((gradient) => gradient.value === profile.iconGradient) ?? iconGradients[0];

const getMinutesFromMidnight = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
};

const getMarkerTop = (timestamp: number) => {
  const percentage = (getMinutesFromMidnight(timestamp) / (24 * 60)) * 100;
  return `${Math.min(99.2, Math.max(0.8, percentage))}%`;
};

const getMarkerLane = (event: LogEvent) => {
  if (event.type === "milk") return 0;
  if (event.diaperKind === "pee") return 1;
  return 2;
};

const getEventPresentation = (event: LogEvent) => {
  if (event.type === "milk") {
    return {
      label: "ミルク",
      detail: `${event.milkMl ?? 0}ml`,
      selectedClass: "rounded-full border-sky-100 bg-blue-500",
    };
  }

  if (event.diaperKind === "pee") {
    return {
      label: "おしっこ",
      detail: "おむつ交換",
      selectedClass: "rounded-[2px] border-cyan-100 bg-cyan-300",
    };
  }

  if (event.diaperKind === "poop") {
    return {
      label: "うんち",
      detail: "おむつ交換",
      selectedClass: "rounded-full border-amber-100 bg-amber-400",
    };
  }

  return {
    label: "おしっこ・うんち",
    detail: "おむつ交換",
    selectedClass:
      "rounded-[2px] border-emerald-100 bg-gradient-to-br from-cyan-300 from-50% to-amber-400 to-50%",
  };
};

const getTickTransformClass = (hour: number) => {
  if (hour === 0) return "";
  if (hour === 24) return "-translate-y-full";
  return "-translate-y-1/2";
};

export function WeeklyTimelineModal({
  open,
  onOpenChange,
  events,
  profiles,
  initialDate,
  initialBabyId,
  now,
}: WeeklyTimelineModalProps) {
  const initialWeekStart = useMemo(
    () => getWeekStart(new Date(`${initialDate}T00:00:00`)),
    [initialDate]
  );
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [selectedBabyId, setSelectedBabyId] = useState<BabyId>(initialBabyId);
  const currentWeekStart = useMemo(() => getWeekStart(now), [now]);

  useEffect(() => {
    if (open) {
      setWeekStart(initialWeekStart);
      setSelectedBabyId(initialBabyId);
    }
  }, [initialBabyId, initialWeekStart, open]);

  const days = useMemo(() => buildWeeklyTimeline(events, weekStart), [events, weekStart]);
  const isCurrentWeek = weekStart.getTime() === currentWeekStart.getTime();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[94vh] sm:max-w-2xl sm:rounded-lg sm:border">
        <DialogHeader className="flex-none border-b px-4 py-3 pr-12 text-left">
          <DialogTitle className="text-base">週間タイムライン</DialogTitle>
          <DialogDescription className="sr-only">
            1週間のミルク、おしっこ、うんちの記録を24時間軸で表示します。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-none space-y-2 border-b bg-card/40 px-2 py-2 sm:px-4">
          <div className="grid grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="前の週"
              onClick={() => setWeekStart((current) => shiftWeek(current, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              type="button"
              className="truncate text-center text-sm font-bold"
              onClick={() => setWeekStart(currentWeekStart)}
              aria-label={isCurrentWeek ? "今週を表示中" : "今週へ移動"}
            >
              {formatWeekLabel(weekStart)}
              {isCurrentWeek ? <span className="ml-1 text-[10px] text-primary">今週</span> : null}
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="次の週"
              disabled={weekStart.getTime() >= currentWeekStart.getTime()}
              onClick={() => setWeekStart((current) => shiftWeek(current, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1">
            {(["A", "B"] as BabyId[]).map((babyId) => {
              const profile = profiles[babyId];
              const gradient = getBabyGradient(profile);
              const selected = selectedBabyId === babyId;

              return (
                <button
                  type="button"
                  key={babyId}
                  onClick={() => setSelectedBabyId(babyId)}
                  aria-label={`${profile.displayName}の記録を強調`}
                  aria-pressed={selected}
                  className={`flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-all ${
                    selected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground opacity-55"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${gradient.bgColor}`} />
                  <span className="truncate">{profile.displayName}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-4 gap-1 text-center text-[9px] leading-none text-muted-foreground min-[390px]:text-[10px]">
            <span className="flex items-center justify-center gap-1">
              <span className="h-2 w-2 rounded-full border border-sky-100 bg-blue-500" />
              ミルク
            </span>
            <span className="flex items-center justify-center gap-1">
              <span className="h-2 w-2 rounded-[2px] border border-cyan-100 bg-cyan-300" />
              おしっこ
            </span>
            <span className="flex items-center justify-center gap-1">
              <span className="h-2 w-2 rounded-full border border-amber-100 bg-amber-400" />
              うんち
            </span>
            <span className="flex items-center justify-center gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-400 opacity-35" />
              薄表示
            </span>
          </div>
        </div>

        <div
          className="grid min-h-0 flex-1 grid-cols-[28px_minmax(0,1fr)] grid-rows-[34px_minmax(0,1fr)] px-1 pb-2 pt-1 sm:grid-cols-[34px_minmax(0,1fr)] sm:px-3"
          role="group"
          aria-label="7日間24時間タイムライングリッド"
          data-day-count="7"
          data-hour-count="24"
        >
          <div aria-hidden="true" />
          <div className="grid grid-cols-7 border-b border-border/70">
            {days.map((day) => {
              const isToday =
                day.date.getFullYear() === now.getFullYear() &&
                day.date.getMonth() === now.getMonth() &&
                day.date.getDate() === now.getDate();

              return (
                <div
                  key={day.key}
                  className={`min-w-0 text-center text-[9px] leading-tight min-[390px]:text-[10px] ${
                    isToday ? "font-bold text-primary" : "text-muted-foreground"
                  }`}
                >
                  <span className="block text-[11px] font-semibold">{weekdayLabels[day.date.getDay()]}</span>
                  <span className="block truncate">{formatShortDate(day.date)}</span>
                </div>
              );
            })}
          </div>

          <div className="relative text-[9px] tabular-nums text-muted-foreground min-[390px]:text-[10px]">
            {hourTicks.map((hour) => (
              <span
                key={hour}
                className={`absolute right-1 ${getTickTransformClass(hour)}`}
                style={{ top: `${(hour / 24) * 100}%` }}
              >
                {hour}
              </span>
            ))}
          </div>

          <div className="relative min-h-0 overflow-hidden border-b border-r border-border/70">
            <div className="pointer-events-none absolute inset-0 z-0">
              {hourTicks.map((hour) => (
                <span
                  key={hour}
                  className="absolute left-0 right-0 border-t border-border/60"
                  style={{ top: `${(hour / 24) * 100}%` }}
                />
              ))}
              {Array.from({ length: 24 }, (_, hour) => hour)
                .filter((hour) => hour % 3 !== 0)
                .map((hour) => (
                  <span
                    key={hour}
                    className="absolute left-0 right-0 border-t border-dashed border-border/20"
                    style={{ top: `${(hour / 24) * 100}%` }}
                  />
                ))}
            </div>

            <div className="relative z-10 grid h-full grid-cols-7">
              {days.map((day, dayIndex) => (
                <div
                  key={day.key}
                  className={`relative min-w-0 border-l border-border/50 ${
                    dayIndex % 2 === 0 ? "bg-card/15" : "bg-muted/10"
                  }`}
                  aria-label={`${day.key}の記録`}
                >
                  {day.events.map((event) => {
                    const profile = profiles[event.babyId];
                    const presentation = getEventPresentation(event);
                    const selected = event.babyId === selectedBabyId;
                    const lane = getMarkerLane(event);
                    const markerLeft = `${25 + lane * 25}%`;
                    const time = fmtTime(new Date(event.timestamp));

                    return (
                      <span
                        key={event.id}
                        role="img"
                        aria-label={`${profile.displayName}の${presentation.label} ${time}`}
                        title={`${profile.displayName} ${presentation.label} ${presentation.detail} ${time}`}
                        data-selected={selected}
                        className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 border shadow-sm min-[390px]:h-3 min-[390px]:w-3 ${
                          selected
                            ? presentation.selectedClass
                            : "rounded-[2px] border-slate-300/40 bg-slate-400 opacity-25 grayscale"
                        }`}
                        style={{ top: getMarkerTop(event.timestamp), left: markerLeft }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
