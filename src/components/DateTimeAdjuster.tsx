import { useState } from "react";
import { Clock3, Pencil } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { formatDateTimeLocalValue, parseDateTimeLocalValue } from "@/lib/entry-drafts";

type DateTimeAdjusterProps = {
  id: string;
  label?: string;
  value: number;
  onChange: (timestamp: number) => void;
  compact?: boolean;
};

const MINUTE_MS = 60 * 1000;

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const compactLabel = (timestamp: number) => {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const day = sameDay(date, today) ? "今日" : sameDay(date, yesterday) ? "昨日"
    : date.getFullYear() === today.getFullYear() ? `${date.getMonth() + 1}/${date.getDate()}`
    : `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  return `${day} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

export function DateTimeAdjuster({ id, label = "日時", value, onChange, compact = false }: DateTimeAdjusterProps) {
  const [editing, setEditing] = useState(false);
  const shiftMinutes = (minutes: number) => onChange(value + minutes * MINUTE_MS);
  const input = (
    <Input
      id={id}
      type="datetime-local"
      aria-label={label + "を直接編集"}
      className={compact ? "h-12 w-full text-base" : "h-9 min-w-0 px-1 text-xs"}
      value={formatDateTimeLocalValue(value)}
      onChange={(event) => {
        const nextTimestamp = parseDateTimeLocalValue(event.target.value);
        if (Number.isFinite(nextTimestamp)) onChange(nextTimestamp);
      }}
    />
  );

  if (compact) {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium text-muted-foreground">{label}</Label>
        <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
          <Button type="button" variant="outline" className="h-12 px-2 text-sm font-semibold"
            aria-label="15分戻す" onClick={() => shiftMinutes(-15)}>−15分</Button>
          <Button type="button" variant="outline"
            className="h-12 min-w-0 justify-between gap-1 px-3 text-base"
            aria-label={label + "を変更"} aria-expanded={editing}
            onClick={() => setEditing((current) => !current)}>
            <span className="flex min-w-0 items-center gap-2">
              <Clock3 aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{compactLabel(value)}</span>
            </span>
            <Pencil aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </div>
        {editing ? input : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-1">
        <Button type="button" variant="outline" className="h-9 select-none px-2 text-sm"
          aria-label="30分戻す" onClick={() => shiftMinutes(-30)}>&lt;&lt;</Button>
        <Button type="button" variant="outline" className="h-9 select-none px-2 text-sm"
          aria-label="10分戻す" onClick={() => shiftMinutes(-10)}>&lt;</Button>
        {input}
        <Button type="button" variant="outline" className="h-9 select-none px-2 text-sm"
          aria-label="10分進める" onClick={() => shiftMinutes(10)}>&gt;</Button>
        <Button type="button" variant="outline" className="h-9 select-none px-2 text-sm"
          aria-label="30分進める" onClick={() => shiftMinutes(30)}>&gt;&gt;</Button>
      </div>
    </div>
  );
}
