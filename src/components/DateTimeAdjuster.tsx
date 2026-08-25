import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { formatDateTimeLocalValue, parseDateTimeLocalValue } from "@/lib/entry-drafts";

type DateTimeAdjusterProps = {
  id: string;
  label?: string;
  value: number;
  onChange: (timestamp: number) => void;
};

const MINUTE_MS = 60 * 1000;

export function DateTimeAdjuster({ id, label = "日時", value, onChange }: DateTimeAdjusterProps) {
  const shiftMinutes = (minutes: number) => onChange(value + minutes * MINUTE_MS);

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-1">
        <Button
          type="button"
          variant="outline"
          className="h-9 select-none px-2 text-sm"
          aria-label="30分戻す"
          onClick={() => shiftMinutes(-30)}
        >
          &lt;&lt;
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-9 select-none px-2 text-sm"
          aria-label="10分戻す"
          onClick={() => shiftMinutes(-10)}
        >
          &lt;
        </Button>
        <Input
          id={id}
          type="datetime-local"
          className="h-9 min-w-0 px-1 text-xs"
          value={formatDateTimeLocalValue(value)}
          onChange={(event) => {
            const nextTimestamp = parseDateTimeLocalValue(event.target.value);
            if (Number.isFinite(nextTimestamp)) onChange(nextTimestamp);
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="h-9 select-none px-2 text-sm"
          aria-label="10分進める"
          onClick={() => shiftMinutes(10)}
        >
          &gt;
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-9 select-none px-2 text-sm"
          aria-label="30分進める"
          onClick={() => shiftMinutes(30)}
        >
          &gt;&gt;
        </Button>
      </div>
    </div>
  );
}
