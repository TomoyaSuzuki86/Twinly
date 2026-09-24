import { useEffect, useState } from "react";
import { Label } from "./ui/label";

type MilkAmountControlProps = {
  value: number;
  onChange: (value: number) => void;
  id?: string;
};

const MAX_MILK_ML = 999;
const SLIDER_MAX_ML = 300;

export const normalizeMilkMl = (value: number) =>
  Math.min(MAX_MILK_ML, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));

export function MilkAmountControl({
  value,
  onChange,
  id = "milk-amount",
}: MilkAmountControlProps) {
  const [inputValue, setInputValue] = useState(String(value));

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const commit = (nextValue: number) => {
    const normalized = normalizeMilkMl(nextValue);
    onChange(normalized);
    setInputValue(String(normalized));
  };

  const handleInputChange = (rawValue: string) => {
    const digitsOnly = rawValue.replace(/\D/g, "");
    setInputValue(digitsOnly);
    if (digitsOnly !== "") {
      onChange(normalizeMilkMl(Number(digitsOnly)));
    }
  };

  return (
    <div className="text-center">
      <Label htmlFor={id} className="text-sm font-semibold text-muted-foreground">
        量 (ml)
      </Label>
      <div className="mt-3 flex items-baseline justify-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label="ミルク量"
          value={inputValue}
          onChange={(event) => handleInputChange(event.target.value)}
          onBlur={() => commit(Number(inputValue || 0))}
          onFocus={(event) => event.currentTarget.select()}
          className="w-48 border-0 bg-transparent p-0 text-center text-7xl font-extrabold tracking-tight outline-none [color:hsl(var(--care-milk))] focus:ring-0"
        />
        <span className="text-xl font-semibold text-muted-foreground">ml</span>
      </div>
      <input
        type="range"
        min="0"
        max={SLIDER_MAX_ML}
        step="10"
        value={Math.min(SLIDER_MAX_ML, value)}
        onChange={(event) => commit(Number(event.target.value))}
        aria-label="ミルク量スライダー"
        aria-valuetext={`${value}ml`}
        className="mt-5 h-2 w-full cursor-pointer accent-sky-500"
      />
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>0ml</span>
        <span>10ml刻み</span>
        <span>{SLIDER_MAX_ML}ml</span>
      </div>
    </div>
  );
}
