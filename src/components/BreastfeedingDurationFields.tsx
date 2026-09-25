import { Label } from "./ui/label";

const durationOptions = [
  { value: 0, label: "なし" },
  ...Array.from({ length: 12 }, (_, index) => {
    const minutes = (index + 1) * 5;
    return { value: minutes, label: `${minutes}分` };
  }),
];

export function BreastfeedingDurationFields({
  leftMinutes,
  rightMinutes,
  onLeftChange,
  onRightChange,
}: {
  leftMinutes: number;
  rightMinutes: number;
  onLeftChange: (minutes: number) => void;
  onRightChange: (minutes: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label htmlFor="breast-left-minutes">左</Label>
        <select
          id="breast-left-minutes"
          aria-label="左の授乳時間"
          value={leftMinutes}
          onChange={(event) => onLeftChange(Number(event.target.value))}
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
        >
          {durationOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="breast-right-minutes">右</Label>
        <select
          id="breast-right-minutes"
          aria-label="右の授乳時間"
          value={rightMinutes}
          onChange={(event) => onRightChange(Number(event.target.value))}
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
        >
          {durationOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
