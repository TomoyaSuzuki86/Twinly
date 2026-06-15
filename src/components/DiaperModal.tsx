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
import { DiaperKind, BabyProfile } from "@/types";
import { useEffect, useState } from "react";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DiaperDraft, formatDateTimeLocalValue, parseDateTimeLocalValue } from "@/lib/entry-drafts";

type DiaperModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  initialDraft: DiaperDraft;
  onSave: (payload: { diaperKind: DiaperKind; note: string; selectedDiaperSize: string; timestamp: number }) => void;
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
  initialDraft,
  onSave,
  diaperStockManagementEnabled,
  diaperStockBySize,
  onUpdateDiaperStock,
}: DiaperModalProps) {
  const [diaperKind, setDiaperKind] = useState<DiaperKind>(initialDraft.diaperKind);
  const [note, setNote] = useState(initialDraft.note);
  const [selectedDiaperSize, setSelectedDiaperSize] = useState(initialDraft.selectedDiaperSize);
  const [dateTimeValue, setDateTimeValue] = useState(formatDateTimeLocalValue(initialDraft.timestamp));
  const [currentDiaperStock, setCurrentDiaperStock] = useState<number>(0);

  useEffect(() => {
    if (!open) return;
    setDiaperKind(initialDraft.diaperKind);
    setNote(initialDraft.note);
    setSelectedDiaperSize(initialDraft.selectedDiaperSize);
    setDateTimeValue(formatDateTimeLocalValue(initialDraft.timestamp));
    setCurrentDiaperStock(diaperStockBySize[initialDraft.selectedDiaperSize] || 0);
  }, [open, initialDraft, diaperStockBySize]);

  useEffect(() => {
    if (!selectedDiaperSize) return;
    setCurrentDiaperStock(diaperStockBySize[selectedDiaperSize] || 0);
  }, [selectedDiaperSize, diaperStockBySize]);

  const handleSave = () => {
    onSave({
      diaperKind,
      note,
      selectedDiaperSize,
      timestamp: parseDateTimeLocalValue(dateTimeValue),
    });
    onOpenChange(false);
  };

  const handleStockChange = (amount: number) => {
    const nextStock = Math.max(0, currentDiaperStock + amount);
    setCurrentDiaperStock(nextStock);
    onUpdateDiaperStock(selectedDiaperSize, nextStock);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{displayName}: おむつ記録</DialogTitle>
          <DialogDescription>種類、サイズ、記録日時を確認して保存できます。</DialogDescription>
        </DialogHeader>
        <div className="space-y-8 py-4">
          <div>
            <Label className="text-sm font-semibold text-muted-foreground">種類</Label>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {diaperKindOptions.map((option) => (
                <Button
                  key={option.kind}
                  variant={diaperKind === option.kind ? "default" : "outline"}
                  className="py-6 text-base"
                  onClick={() => setDiaperKind(option.kind)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {diaperStockManagementEnabled ? (
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-muted-foreground">おむつ在庫</Label>
            <div className="mt-2 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="diaper-size-select" className="w-24">
                  サイズ
                </Label>
                <Select value={selectedDiaperSize} onValueChange={setSelectedDiaperSize}>
                  <SelectTrigger id="diaper-size-select" className="flex-grow">
                    <SelectValue placeholder="サイズを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(diaperStockBySize).map((size) => (
                      <SelectItem key={size} value={size}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor="diaper-stock-input" className="w-24">
                  在庫数
                </Label>
                <Button variant="outline" size="icon" onClick={() => handleStockChange(-10)} className="h-9 w-9">
                  -10
                </Button>
                <Button variant="outline" size="icon" onClick={() => handleStockChange(-1)} className="h-9 w-9">
                  -1
                </Button>
                <Input
                  id="diaper-stock-input"
                  type="number"
                  value={currentDiaperStock}
                  onChange={(e) => {
                    const nextStock = Math.max(0, Number(e.target.value));
                    setCurrentDiaperStock(nextStock);
                    onUpdateDiaperStock(selectedDiaperSize, nextStock);
                  }}
                  className="w-20 text-center text-base"
                />
                <Button variant="outline" size="icon" onClick={() => handleStockChange(1)} className="h-9 w-9">
                  +1
                </Button>
                <Button variant="outline" size="icon" onClick={() => handleStockChange(10)} className="h-9 w-9">
                  +10
                </Button>
              </div>
            </div>
          </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="diaper-datetime" className="text-xs text-muted-foreground">
              日時
            </Label>
            <Input
              id="diaper-datetime"
              type="datetime-local"
              value={dateTimeValue}
              onChange={(e) => setDateTimeValue(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="diaper-note" className="text-xs text-muted-foreground">
              メモ（任意）
            </Label>
            <Input
              id="diaper-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="機嫌や様子など"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">キャンセル</Button>
          </DialogClose>
          <Button onClick={handleSave} className="bg-amber-600 hover:bg-amber-500">
            保存する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
