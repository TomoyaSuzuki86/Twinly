import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { MilkDraft, stepMilkAmount } from "@/lib/entry-drafts";
import { DateTimeAdjuster } from "./DateTimeAdjuster";

type MilkModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  isSleeping?: boolean;
  initialDraft: MilkDraft;
  onSave: (payload: { milkMl: number; note: string; timestamp: number; autoWake: boolean }) => void;
  onSaveSolidFood?: (payload: { note: string; timestamp: number; autoWake: boolean }) => void;
};

export function MilkModal({
  open,
  onOpenChange,
  displayName,
  isSleeping = false,
  initialDraft,
  onSave,
  onSaveSolidFood,
}: MilkModalProps) {
  const [recordType, setRecordType] = useState<"milk" | "solidFood">("milk");
  const [milkMl, setMilkMl] = useState(initialDraft.milkMl);
  const [note, setNote] = useState(initialDraft.note);
  const [solidFoodNote, setSolidFoodNote] = useState("");
  const [timestamp, setTimestamp] = useState(initialDraft.timestamp);
  const [autoWake, setAutoWake] = useState(true);

  useEffect(() => {
    if (!open) return;
    setRecordType("milk");
    setMilkMl(initialDraft.milkMl);
    setNote(initialDraft.note);
    setSolidFoodNote("");
    setTimestamp(initialDraft.timestamp);
    setAutoWake(true);
  }, [open, initialDraft]);

  const handleMilkAmountChange = (nextValue: number) => {
    setMilkMl(nextValue);
  };

  const handleSave = () => {
    if (recordType === "solidFood") {
      onSaveSolidFood?.({ note: solidFoodNote.trim(), timestamp, autoWake });
      onOpenChange(false);
      return;
    }

    onSave({
      milkMl,
      note,
      timestamp,
      autoWake,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{displayName}: 食事記録</DialogTitle>
          <DialogDescription>ミルクまたは離乳食を選んで記録します。</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1">
            <Button
              type="button"
              variant={recordType === "milk" ? "secondary" : "ghost"}
              className={recordType === "milk" ? "text-sky-200" : ""}
              onClick={() => setRecordType("milk")}
            >
              ミルク
            </Button>
            <Button
              type="button"
              variant={recordType === "solidFood" ? "secondary" : "ghost"}
              className={recordType === "solidFood" ? "text-emerald-300" : ""}
              onClick={() => setRecordType("solidFood")}
            >
              離乳食
            </Button>
          </div>

          {recordType === "milk" ? (
            <>
              <div className="text-center">
                <Label className="text-sm font-semibold text-muted-foreground">量 (ml)</Label>
                <div className="mt-4 flex items-center justify-center gap-6">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-16 w-16 rounded-full"
                    aria-label="ミルク量を減らす"
                    onClick={() => handleMilkAmountChange(stepMilkAmount(milkMl, -1))}
                  >
                    <span className="text-3xl font-semibold">-</span>
                  </Button>
                  <div className="w-32 text-center text-7xl font-extrabold tracking-tight text-sky-300">
                    {milkMl}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-16 w-16 rounded-full"
                    aria-label="ミルク量を増やす"
                    onClick={() => handleMilkAmountChange(stepMilkAmount(milkMl, 1))}
                  >
                    <span className="text-3xl font-semibold">+</span>
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <Label htmlFor="solid-food-note" className="font-semibold text-emerald-200">
                メモ
              </Label>
              <Textarea
                id="solid-food-note"
                value={solidFoodNote}
                onChange={(e) => setSolidFoodNote(e.target.value)}
                placeholder="例：10倍がゆ 小さじ2、にんじん 少し"
                className="min-h-28"
              />
              <p className="text-xs text-muted-foreground">食べたものや量、様子などを自由に記録できます。</p>
            </div>
          )}

          <DateTimeAdjuster id="feeding-datetime" value={timestamp} onChange={setTimestamp} />
          {isSleeping ? (
            <label
              htmlFor="feeding-auto-wake"
              className="flex cursor-pointer items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5"
            >
              <input
                id="feeding-auto-wake"
                type="checkbox"
                checked={autoWake}
                onChange={(event) => setAutoWake(event.target.checked)}
                className="h-5 w-5 accent-violet-500"
              />
              <span>
                <span className="block text-sm font-semibold">自動的に起床する</span>
                <span className="block text-xs text-muted-foreground">食事記録の15分前に起床を追加します</span>
              </span>
            </label>
          ) : null}
          {recordType === "milk" ? (
            <div className="space-y-2">
              <Label htmlFor="milk-note" className="text-xs text-muted-foreground">
                メモ（任意）
              </Label>
              <Input
                id="milk-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="機嫌や飲み方など"
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">キャンセル</Button>
          </DialogClose>
          <Button
            onClick={handleSave}
            className={
              recordType === "solidFood"
                ? "bg-emerald-600 hover:bg-emerald-500"
                : "bg-sky-600 hover:bg-sky-500"
            }
          >
            保存する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
