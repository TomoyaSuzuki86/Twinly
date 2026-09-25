import { Button } from "@/components/ui/button";
import { Label } from "./ui/label";

const durationOptions = Array.from({ length: 12 }, (_, index) => {
  const minutes = (index + 1) * 5;
  return { value: minutes, label: `${minutes}分` };
});

function SideDuration({
  side,
  active,
  minutes,
  onToggle,
  onChange,
}: {
  side: "左" | "右";
  active: boolean;
  minutes: number;
  onToggle: () => void;
  onChange: (minutes: number) => void;
}) {
  const id = side === "左" ? "breast-left-minutes" : "breast-right-minutes";
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={active ? "secondary" : "outline"}
        className={`w-full ${active ? "border-pink-400/50 bg-pink-500/15 text-pink-200" : ""}`}
        aria-pressed={active}
        onClick={onToggle}
      >
        {side}
      </Button>
      <Label htmlFor={id} className="sr-only">{side}の授乳時間</Label>
      <select
        id={id}
        aria-label={`${side}の授乳時間`}
        value={minutes}
        disabled={!active}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base disabled:cursor-not-allowed disabled:opacity-40"
      >
        {durationOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function BreastfeedingDurationFields({
  leftActive,
  rightActive,
  leftMinutes,
  rightMinutes,
  onLeftActiveChange,
  onRightActiveChange,
  onLeftChange,
  onRightChange,
}: {
  leftActive: boolean;
  rightActive: boolean;
  leftMinutes: number;
  rightMinutes: number;
  onLeftActiveChange: (active: boolean) => void;
  onRightActiveChange: (active: boolean) => void;
  onLeftChange: (minutes: number) => void;
  onRightChange: (minutes: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <SideDuration
        side="左"
        active={leftActive}
        minutes={leftMinutes}
        onToggle={() => onLeftActiveChange(!leftActive)}
        onChange={onLeftChange}
      />
      <SideDuration
        side="右"
        active={rightActive}
        minutes={rightMinutes}
        onToggle={() => onRightActiveChange(!rightActive)}
        onChange={onRightChange}
      />
    </div>
  );
}
