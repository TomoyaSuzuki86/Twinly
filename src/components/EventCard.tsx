import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogEvent } from "@/types";
import { fmtTime } from "@/lib/utils";
import { Droplets, FileText, Milk, Pencil, Trash2 } from "lucide-react";
import { Button } from "./ui/button";

export function EventCard({
  event,
  onEdit,
  onDelete,
}: {
  event: LogEvent;
  onEdit: (event: LogEvent) => void;
  onDelete: (event: LogEvent) => void;
}) {
  const t = fmtTime(new Date(event.timestamp));
  const iconBg =
    event.type === "milk"
      ? "bg-sky-500/20"
      : event.type === "diaper"
      ? "bg-amber-500/20"
      : "bg-violet-500/20";
  const icon =
    event.type === "milk" ? (
      <Milk className="h-5 w-5 text-sky-300" />
    ) : event.type === "diaper" ? (
      <Droplets className="h-5 w-5 text-amber-300" />
    ) : (
      <FileText className="h-5 w-5 text-violet-300" />
    );

  const title =
    event.type === "milk"
      ? `${event.milkMl ?? 0}ml・${
          event.milkMethod === "breast" ? "母乳" : "哺乳瓶"
        }`
      : event.type === "diaper"
      ? `おむつ・${
          event.diaperKind === "pee"
            ? "おしっこ"
            : event.diaperKind === "poop"
            ? "うんち"
            : "両方"
        }`
      : "日次レポート";
  const statusDot =
    event.calendarStatus === "synced"
      ? "bg-emerald-400"
      : event.calendarStatus === "pending"
      ? "bg-amber-400"
      : event.calendarStatus === "error"
      ? "bg-rose-400"
      : "bg-white/30";

  return (
    <Card className="flex items-center justify-between p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`grid h-12 w-12 flex-shrink-0 place-items-center rounded-lg ${iconBg}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{title}</p>
          {event.note ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {event.note}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        <span
          className={`h-2 w-2 rounded-full ${statusDot}`}
          title={`カレンダー: ${event.calendarStatus ?? "-"}`}
        />
        <div className="w-14 text-right text-sm text-muted-foreground">
          {t}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(event)}
          aria-label="edit"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(event)}
          aria-label="delete"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
