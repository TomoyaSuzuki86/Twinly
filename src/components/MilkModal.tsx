import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import type { MilkDraft } from "@/lib/entry-drafts";
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
  const [openedDraft, setOpenedDraft] = useState(initialDraft);
  const [discardConfirming, setDiscardConfirming] = useState(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!justOpened) return;
    setOpenedDraft(initialDraft);
    setRecordType("milk");
    setMilkMl(initialDraft.milkMl);
    setNote(initialDraft.note);
    setSolidFoodNote("");
    setTimestamp(initialDraft.timestamp);
    setAutoWake(true);
    setDiscardConfirming(false);
  }, [open, initialDraft]);

  const hasUnsavedChanges =
    recordType !== "milk" ||
    milkMl !== openedDraft.milkMl ||
    note !== openedDraft.note ||
    solidFoodNote !== "" ||
    timestamp !== openedDraft.timestamp ||
    autoWake !== true;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && hasUnsavedChanges) {
      setDiscardConfirming(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const changeMilkAmount = (delta: number) => {
    setMilkMl((current) => Math.max(0, Math.min(999, current + delta)));
  };

  const handleSave = () => {
    if (recordType === "solidFood") {
      onSaveSolidFood?.({ note: solidFoodNote.trim(), timestamp, autoWake });
    } else {
      if (milkMl <= 0) return;
      onSave({ milkMl, note, timestamp, autoWake });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{displayName}の食事</DialogTitle>
          <DialogDescription className="sr-only">食事内容と日時を記録します。</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-1">
          <div className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/40 p-1">
            <Button
              type="button"
              variant={recordType === "milk" ? "secondary" : "ghost"}
              className="h-12 text-base"
              aria-pressed={recordType === "milk"}
              onClick={() => setRecordType("milk")}
            >
              ミルク
            </Button>
            <Button
              type="button"
              variant={recordType === "solidFood" ? "secondary" : "ghost"}
              className="h-12 text-base"
              aria-pressed={recordType === "solidFood"}
              onClick={() => setRecordType("solidFood")}
            >
              離乳食
            </Button>
          </div>

          {recordType === "milk" ? (
            <div className="space-y-3 text-center">
              <Label htmlFor="milk-amount" className="text-sm font-medium text-muted-foreground">
                ミルク量
              </Label>
              <div className="mx-auto grid w-full max-w-sm grid-cols-[72px_minmax(0,1fr)_72px] items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-14 px-1 text-lg font-semibold"
                  aria-label="ミルク量を10ml減らす"
                  disabled={milkMl === 0}
                  onClick={() => changeMilkAmount(-10)}
                >
                  −10
                </Button>
                <div className="flex min-w-0 items-center justify-center gap-1">
                  <Input
                    id="milk-amount"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label="ミルク量（ml）"
                    value={milkMl === 0 ? "" : String(milkMl)}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (raw === "") setMilkMl(0);
                      else if (/^\d+$/.test(raw)) setMilkMl(Math.min(999, Number(raw)));
                    }}
                    className="h-16 min-w-0 w-full border-0 bg-transparent px-0 text-right text-5xl font-extrabold tracking-tight shadow-none focus-visible:ring-1 [color:hsl(var(--care-milk))]"
                  />
                  <span className="shrink-0 text-sm text-muted-foreground">ml</span>
                  <Pencil aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-14 px-1 text-lg font-semibold"
                  aria-label="ミルク量を10ml増やす"
                  disabled={milkMl >= 999}
                  onClick={() => changeMilkAmount(10)}
                >
                  ＋10
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="solid-food-note" className="text-sm font-medium text-muted-foreground">
                食べたもの・量
              </Label>
              <Textarea
                id="solid-food-note"
                value={solidFoodNote}
                onChange={(event) => setSolidFoodNote(event.target.value)}
                placeholder="例：10倍がゆ 小さじ2"
                className="min-h-24"
              />
            </div>
          )}

          <DateTimeAdjuster id="feeding-datetime" value={timestamp} onChange={setTimestamp} compact />

          {isSleeping ? (
            <label
              htmlFor="feeding-auto-wake"
              className="flex cursor-pointer items-center gap-3 rounded-xl border bg-muted/30 px-3 py-2.5"
            >
              <input
                id="feeding-auto-wake"
                type="checkbox"
                checked={autoWake}
                onChange={(event) => setAutoWake(event.target.checked)}
                className="h-5 w-5 shrink-0 accent-violet-500"
              />
              <span>
                <span className="block text-sm font-semibold">自動で起床を記録</span>
                <span className="block text-xs text-muted-foreground">食事の15分前に起床を追加</span>
              </span>
            </label>
          ) : null}

          {recordType === "milk" ? (
            <div className="space-y-2">
              <Label htmlFor="milk-note" className="text-sm font-medium text-muted-foreground">
                メモ（任意）
              </Label>
              <Input
                id="milk-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="機嫌や飲み方など"
              />
            </div>
          ) : null}
        </div>
        <DialogFooter className="pt-1">
          {discardConfirming ? (
            <div className="w-full space-y-2" role="alert">
              <p className="text-center text-sm">入力内容を破棄しますか？</p>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => setDiscardConfirming(false)}>戻る</Button>
                <Button type="button" variant="destructive" onClick={() => onOpenChange(false)}>破棄する</Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              onClick={handleSave}
              disabled={recordType === "milk" ? milkMl <= 0 : !onSaveSolidFood}
              className="h-12 w-full bg-sky-600 text-base text-white hover:bg-sky-500"
            >
              保存する
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
