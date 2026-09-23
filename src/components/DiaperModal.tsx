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
import type { DiaperKind, BabyProfile } from "@/types";
import { useEffect, useRef, useState } from "react";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DiaperDraft } from "@/lib/entry-drafts";
import { DateTimeAdjuster } from "./DateTimeAdjuster";

type DiaperModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  isSleeping?: boolean;
  initialDraft: DiaperDraft;
  onSave: (payload: { diaperKind: DiaperKind; note: string; selectedDiaperSize: string; timestamp: number; autoWake: boolean }) => void;
  diaperStockManagementEnabled: boolean;
  diaperStockBySize: Record<string, number>;
  onUpdateDiaperStock: (size: string, stock: number) => void;
  babyProfile: BabyProfile;
};

const diaperKindOptions = [
  { kind: "pee" as const, label: "おしっこ" },
  { kind: "poop" as const, label: "うんち" },
];

export function DiaperModal({
  open,
  onOpenChange,
  displayName,
  isSleeping = false,
  initialDraft,
  onSave,
  diaperStockManagementEnabled,
  diaperStockBySize,
  onUpdateDiaperStock,
}: DiaperModalProps) {
  const [diaperKind, setDiaperKind] = useState<DiaperKind>(initialDraft.diaperKind);
  const [note, setNote] = useState(initialDraft.note);
  const [selectedDiaperSize, setSelectedDiaperSize] = useState(initialDraft.selectedDiaperSize);
  const [timestamp, setTimestamp] = useState(initialDraft.timestamp);
  const [currentDiaperStock, setCurrentDiaperStock] = useState(0);
  const [stockExpanded, setStockExpanded] = useState(false);
  const [autoWake, setAutoWake] = useState(true);
  const [openedDraft, setOpenedDraft] = useState(initialDraft);
  const [discardConfirming, setDiscardConfirming] = useState(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!justOpened) return;
    setOpenedDraft(initialDraft);
    setDiaperKind(initialDraft.diaperKind);
    setNote(initialDraft.note);
    setSelectedDiaperSize(initialDraft.selectedDiaperSize);
    setTimestamp(initialDraft.timestamp);
    setCurrentDiaperStock(diaperStockBySize[initialDraft.selectedDiaperSize] || 0);
    setStockExpanded(false);
    setAutoWake(true);
    setDiscardConfirming(false);
  }, [open, initialDraft, diaperStockBySize]);

  useEffect(() => {
    if (!selectedDiaperSize) return;
    setCurrentDiaperStock(diaperStockBySize[selectedDiaperSize] || 0);
  }, [selectedDiaperSize, diaperStockBySize]);

  const hasUnsavedChanges =
    diaperKind !== openedDraft.diaperKind ||
    note !== openedDraft.note ||
    selectedDiaperSize !== openedDraft.selectedDiaperSize ||
    timestamp !== openedDraft.timestamp ||
    autoWake !== true;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && hasUnsavedChanges) {
      setDiscardConfirming(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleSave = () => {
    onSave({ diaperKind, note, selectedDiaperSize, timestamp, autoWake });
    onOpenChange(false);
  };

  // Stock is a separate immediate setting, as in the original screen.
  const updateStock = (next: number) => {
    if (!selectedDiaperSize) return;
    const value = Math.min(9999, Math.max(0, next));
    setCurrentDiaperStock(value);
    onUpdateDiaperStock(selectedDiaperSize, value);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{displayName}のおむつ</DialogTitle>
          <DialogDescription className="sr-only">おむつ交換の種類と日時を記録します。</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-1">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground">種類</Label>
            <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/40 p-1">
              {diaperKindOptions.map((option) => (
                <Button key={option.kind} type="button"
                  variant={diaperKind === option.kind ? "secondary" : "ghost"}
                  aria-pressed={diaperKind === option.kind}
                  className="h-12 text-base"
                  onClick={() => setDiaperKind(option.kind)}>
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <DateTimeAdjuster id="diaper-datetime" value={timestamp} onChange={setTimestamp} compact />

          {isSleeping ? (
            <label htmlFor="diaper-auto-wake"
              className="flex cursor-pointer items-center gap-3 rounded-xl border bg-muted/30 px-3 py-2.5">
              <input id="diaper-auto-wake" type="checkbox" checked={autoWake}
                onChange={(event) => setAutoWake(event.target.checked)}
                className="h-5 w-5 shrink-0 accent-violet-500" />
              <span>
                <span className="block text-sm font-semibold">自動で起床を記録</span>
                <span className="block text-xs text-muted-foreground">おむつ交換の1分前に起床を追加</span>
              </span>
            </label>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="diaper-note" className="text-sm font-medium text-muted-foreground">メモ（任意）</Label>
            <Input id="diaper-note" value={note} onChange={(event) => setNote(event.target.value)}
              placeholder="機嫌や様子など" />
          </div>

          {diaperStockManagementEnabled ? (
            <div className="rounded-xl border px-3 py-2">
              <Button type="button" variant="ghost" aria-expanded={stockExpanded}
                className="h-11 w-full justify-between gap-2 px-0"
                onClick={() => setStockExpanded((current) => !current)}>
                <span className="text-sm font-medium">おむつ在庫</span>
                <span className="text-sm text-muted-foreground">
                  {selectedDiaperSize} · {currentDiaperStock}枚　{stockExpanded ? "閉じる" : "変更"}
                </span>
              </Button>
              {stockExpanded ? (
                <div className="space-y-3 pb-2 pt-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="diaper-size-select" className="shrink-0 text-sm">サイズ</Label>
                    <Select value={selectedDiaperSize} onValueChange={setSelectedDiaperSize}>
                      <SelectTrigger id="diaper-size-select" className="h-11 flex-1">
                        <SelectValue placeholder="サイズを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(diaperStockBySize).map((size) => (
                          <SelectItem key={size} value={size}>{size}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Input id="diaper-stock-input" aria-label="おむつ在庫数" type="number" min={0} max={9999}
                      className="h-11 w-full text-center text-base" value={currentDiaperStock}
                      onChange={(event) => updateStock(Number(event.target.value))} />
                    <div className="grid grid-cols-4 gap-2">
                      {([-10, -1, 1, 10] as const).map((delta) => (
                        <Button key={delta} type="button" variant="outline" className="h-11 px-1 text-sm"
                          aria-label={`在庫を${Math.abs(delta)}枚${delta < 0 ? "減らす" : "増やす"}`}
                          onClick={() => updateStock(currentDiaperStock + delta)}>
                          {delta > 0 ? "+" : "−"}{Math.abs(delta)}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">在庫数の変更はすぐに反映されます。</p>
                </div>
              ) : null}
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
            <Button type="button" onClick={handleSave}
              className="h-12 w-full bg-amber-600 text-base text-white hover:bg-amber-500">
              保存する
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
