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

const shifts = [
  { minutes: -30, label: "-30分" },
  { minutes: -10, label: "-10分" },
  { minutes: 10, label: "+10分" },
  { minutes: 30, label: "+30分" },
] as const;

export function DateTimeAdjuster({ id, label = "日時", value, onChange }: DateTimeAdjusterProps) {
  const shiftMinutes = (minutes: number) => onChange(value + minutes * MINUTE_MS);

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Input
        id={id}
        type="datetime-local"
        className="h-10 w-full text-sm"
        value={formatDateTimeLocalValue(value)}
        onChange={(event) => {
          const nextTimestamp = parseDateTimeLocalValue(event.target.value);
          if (Number.isFinite(nextTimestamp)) onChange(nextTimestamp);
        }}
      />
      <div className="grid grid-cols-4 gap-2">
        {shifts.map(({ minutes, label: shiftLabel }) => (
          <Button
            key={minutes}
            type="button"
            variant="outline"
            className="h-10 min-w-0 select-none px-2 text-sm font-semibold"
            aria-label={`${Math.abs(minutes)}分${minutes < 0 ? "戻す" : "進める"}`}
            onClick={() => shiftMinutes(minutes)}
          >
            {shiftLabel}
          </Button>
        ))}
      </div>
    </div>
  );
}
