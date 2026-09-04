import { Card } from "@/components/ui/card";
import { LogEvent } from "@/types";
import { fmtTime } from "@/lib/utils";
import { formatSleepDuration } from "@/lib/sleep";
import {
  Droplets,
  FileText,
  Milk,
  Moon,
  Ruler,
  Thermometer,
  Utensils,
  Sun,
  Weight,
} from "lucide-react";

const formatEventTitle = (event: LogEvent) => {
  if (event.type === "milk") {
    return `${event.milkMl ?? 0}ml・ミルク`;
  }

  if (event.type === "solidFood") {
    return "離乳食";
  }

  if (event.type === "diaper") {
    const kind =
      event.diaperKind === "pee" ? "おしっこ" : event.diaperKind === "poop" ? "うんち" : "両方";
    return `おむつ・${kind}`;
  }

  if (event.type === "sleepStart") return "入眠";
  if (event.type === "wake") return "起床";

  if (event.type === "temperature") {
    return `体温: ${event.temperature?.toFixed(1) ?? "-"}℃`;
  }

  if (event.type === "weight") {
    return `体重: ${event.weight?.toFixed(2) ?? "-"}kg`;
  }

  if (event.type === "height") {
    return `身長: ${event.height?.toFixed(1) ?? "-"}cm`;
  }

  return "日次メモ";
};

export function EventCard({
  event,
  onEdit,
  invalidSleepMarker = false,
  sleepDurationMinutes,
  creatorName,
}: {
  event: LogEvent;
  onEdit: (event: LogEvent) => void;
  invalidSleepMarker?: boolean;
  sleepDurationMinutes?: number;
  creatorName?: string;
}) {
  const time = fmtTime(new Date(event.timestamp));
  const title =
    event.type === "wake" && sleepDurationMinutes !== undefined
      ? `起床・睡眠 ${formatSleepDuration(sleepDurationMinutes)}`
      : formatEventTitle(event);
  const iconBg =
    event.type === "milk"
      ? "bg-sky-500/20"
      : event.type === "solidFood"
      ? "bg-emerald-500/20"
      : event.type === "diaper"
      ? "bg-amber-500/20"
      : event.type === "sleepStart"
      ? "bg-indigo-500/20"
      : event.type === "wake"
      ? "bg-orange-500/20"
      : event.type === "temperature"
      ? "bg-rose-500/20"
      : event.type === "weight"
      ? "bg-lime-500/20"
      : event.type === "height"
      ? "bg-blue-500/20"
      : "bg-violet-500/20";

  const icon =
    event.type === "milk" ? (
      <Milk className="h-5 w-5 text-sky-300" />
    ) : event.type === "solidFood" ? (
      <Utensils className="h-5 w-5 text-emerald-300" />
    ) : event.type === "diaper" ? (
      <Droplets className="h-5 w-5 text-amber-300" />
    ) : event.type === "sleepStart" ? (
      <Moon className="h-5 w-5 text-indigo-300" />
    ) : event.type === "wake" ? (
      <Sun className="h-5 w-5 text-orange-300" />
    ) : event.type === "temperature" ? (
      <Thermometer className="h-5 w-5 text-rose-300" />
    ) : event.type === "weight" ? (
      <Weight className="h-5 w-5 text-lime-300" />
    ) : event.type === "height" ? (
      <Ruler className="h-5 w-5 text-blue-300" />
    ) : (
      <FileText className="h-5 w-5 text-violet-300" />
    );

  return (
    <button
      type="button"
      className="w-full text-left"
      onClick={() => onEdit(event)}
      aria-label={`${title} ${time}を編集`}
    >
      <Card className={`flex items-start justify-between gap-3 p-3 transition-colors hover:bg-accent/40 sm:p-4 ${invalidSleepMarker ? "opacity-40 grayscale" : ""}`}>
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className={`grid h-12 w-12 flex-shrink-0 place-items-center rounded-lg ${iconBg}`}>{icon}</div>
          <div className="min-w-0 flex-1 py-0.5">
            <p className="font-semibold">{title}</p>
            {invalidSleepMarker ? (
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {event.type === "sleepStart"
                  ? "直前の入眠が継続中のため集計対象外"
                  : "対応する入眠記録がないため集計対象外"}
              </p>
            ) : event.note ? (
              <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{event.note}</p>
            ) : null}
          </div>
        </div>
        <div className="flex-shrink-0 py-0.5 text-right text-sm text-muted-foreground">
          <div>{time}</div>
          {creatorName ? (
            <div className="mt-1 flex items-center justify-end gap-1 text-[11px]" title={`記録：${creatorName}`}>
              <span className="grid h-4 w-4 place-items-center rounded-full bg-violet-500/20 text-[9px] font-bold text-violet-200">
                {creatorName.slice(0, 1)}
              </span>
              <span className="max-w-16 truncate">{creatorName}</span>
            </div>
          ) : null}
        </div>
      </Card>
    </button>
  );
}
