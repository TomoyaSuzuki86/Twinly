import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Droplets, Milk } from "lucide-react";
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

const formatShortDate = (date: Date) => `${date.getMonth() + 1}/${date.getDate()}`;

const formatWeekLabel = (weekStart: Date) => {
  const end = getWeekEnd(weekStart);
  return `${formatShortDate(weekStart)}（月）〜${formatShortDate(end)}（日）`;
};

const describeEvent = (event: LogEvent) => {
  if (event.type === "milk") {
    const method = event.milkMethod === "breast" ? "母乳" : "哺乳瓶";
    return {
      label: "ミルク",
      detail: `${event.milkMl ?? 0}ml・${method}`,
      icon: Milk,
      typeClass: "border-sky-400/40 bg-sky-500/15 text-sky-200",
    };
  }

  const label =
    event.diaperKind === "pee" ? "おしっこ" : event.diaperKind === "poop" ? "うんち" : "両方";
  const typeClass =
    event.diaperKind === "pee"
      ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-200"
      : event.diaperKind === "poop"
        ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
        : "border-emerald-400/40 bg-emerald-500/15 text-emerald-200";

  return {
    label,
    detail: event.note || "おむつ交換",
    icon: Droplets,
    typeClass,
  };
};

const getBabyGradient = (profile: BabyProfile) =>
  iconGradients.find((gradient) => gradient.value === profile.iconGradient) ?? iconGradients[0];

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
  const weekEventCount = days.reduce((count, day) => count + day.events.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-w-5xl flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[90vh] sm:rounded-lg">
        <DialogHeader className="border-b px-4 pb-4 pt-5 pr-12 text-left sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            週間タイムライン
          </DialogTitle>
          <DialogDescription>
            ミルク・おしっこ・うんちを、2人分まとめて時系列で確認できます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border-b bg-card/40 px-3 py-3 sm:px-6">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="前の週"
              onClick={() => setWeekStart((current) => shiftWeek(current, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 text-center">
              <p className="truncate text-base font-bold">{formatWeekLabel(weekStart)}</p>
              <p className="text-xs text-muted-foreground">{weekEventCount}件の記録</p>
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="次の週"
              disabled={weekStart.getTime() >= currentWeekStart.getTime()}
              onClick={() => setWeekStart((current) => shiftWeek(current, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid min-w-[220px] flex-1 grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1 sm:max-w-md">
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
                    className={`flex min-w-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-all ${
                      selected
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground opacity-55 hover:opacity-80"
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${gradient.bgColor}`} />
                    <span className="truncate">{profile.displayName}</span>
                  </button>
                );
              })}
            </div>
            {!isCurrentWeek ? (
              <Button variant="ghost" size="sm" onClick={() => setWeekStart(currentWeekStart)}>
                今週へ
              </Button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
          <div className="space-y-4">
            {days.map((day) => {
              const isToday =
                day.date.getFullYear() === now.getFullYear() &&
                day.date.getMonth() === now.getMonth() &&
                day.date.getDate() === now.getDate();

              return (
                <section key={day.key} aria-label={`${day.key}の記録`}>
                  <div className="sticky top-0 z-10 mb-2 flex items-center gap-2 border-b bg-background/95 py-2 backdrop-blur">
                    <div
                      className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${
                        isToday ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}
                    >
                      {day.date.getDate()}
                    </div>
                    <div>
                      <h3 className="font-bold">
                        {formatShortDate(day.date)}（{weekdayLabels[day.date.getDay()]}）
                        {isToday ? <span className="ml-2 text-xs text-primary">今日</span> : null}
                      </h3>
                      <p className="text-xs text-muted-foreground">{day.events.length}件</p>
                    </div>
                  </div>

                  {day.events.length === 0 ? (
                    <div className="ml-4 border-l border-dashed border-border py-3 pl-6 text-sm text-muted-foreground">
                      記録なし
                    </div>
                  ) : (
                    <div className="ml-4 space-y-2 border-l border-border pb-2 pl-4 sm:pl-6">
                      {day.events.map((event) => {
                        const profile = profiles[event.babyId];
                        const gradient = getBabyGradient(profile);
                        const description = describeEvent(event);
                        const Icon = description.icon;
                        const selected = event.babyId === selectedBabyId;

                        return (
                          <article
                            key={event.id}
                            aria-label={`${profile.displayName}の${description.label} ${fmtTime(
                              new Date(event.timestamp)
                            )}`}
                            data-selected={selected}
                            className={`relative overflow-hidden rounded-lg border p-3 pl-4 transition-all ${
                              selected
                                ? "bg-card shadow-sm"
                                : "bg-muted/40 opacity-25 grayscale"
                            }`}
                          >
                            <span
                              className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${gradient.value}`}
                            />
                            <span
                              className={`absolute -left-[21px] top-5 h-2.5 w-2.5 rounded-full ring-4 ring-background ${gradient.bgColor}`}
                            />
                            <div className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-3">
                              <time className="pt-1 text-sm font-bold tabular-nums">
                                {fmtTime(new Date(event.timestamp))}
                              </time>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${description.typeClass}`}
                                  >
                                    <Icon className="h-3.5 w-3.5" />
                                    {description.label}
                                  </span>
                                  <span className="text-sm font-bold">{profile.displayName}</span>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">{description.detail}</p>
                                {event.type === "milk" && event.note ? (
                                  <p className="mt-1 truncate text-xs text-muted-foreground">{event.note}</p>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
