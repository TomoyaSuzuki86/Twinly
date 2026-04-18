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
import { MilkMethod } from "@/types";
import { useEffect, useState } from "react";
import { Label } from "./ui/label";
import { MilkDraft, formatDateTimeLocalValue, parseDateTimeLocalValue, stepMilkAmount } from "@/lib/entry-drafts";

type MilkModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  initialDraft: MilkDraft;
  onSave: (payload: { milkMl: number; milkMethod: MilkMethod; note: string; timestamp: number }) => void;
};

export function MilkModal({ open, onOpenChange, displayName, initialDraft, onSave }: MilkModalProps) {
  const [milkMl, setMilkMl] = useState(initialDraft.milkMl);
  const [milkMethod, setMilkMethod] = useState<MilkMethod>(initialDraft.milkMethod);
  const [note, setNote] = useState(initialDraft.note);
  const [dateTimeValue, setDateTimeValue] = useState(formatDateTimeLocalValue(initialDraft.timestamp));

  useEffect(() => {
    if (!open) return;
    setMilkMl(initialDraft.milkMl);
    setMilkMethod(initialDraft.milkMethod);
    setNote(initialDraft.note);
    setDateTimeValue(formatDateTimeLocalValue(initialDraft.timestamp));
  }, [open, initialDraft]);

  const handleSave = () => {
    onSave({
      milkMl,
      milkMethod,
      note,
      timestamp: parseDateTimeLocalValue(dateTimeValue),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{displayName}: ミルク記録</DialogTitle>
          <DialogDescription>量、方法、記録時刻を確認して保存できます。</DialogDescription>
        </DialogHeader>
        <div className="space-y-8 py-4">
          <div className="text-center">
            <Label className="text-sm font-semibold text-muted-foreground">量 (ml)</Label>
            <div className="mt-4 flex items-center justify-center gap-6">
              <Button
                variant="outline"
                size="icon"
                className="h-16 w-16 rounded-full"
                aria-label="ミルク量を減らす"
                onClick={() => setMilkMl((value) => stepMilkAmount(value, -1))}
              >
                <span className="text-3xl font-semibold">-</span>
              </Button>
              <div className="w-32 text-center text-7xl font-extrabold tracking-tight text-sky-300">{milkMl}</div>
              <Button
                variant="outline"
                size="icon"
                className="h-16 w-16 rounded-full"
                aria-label="ミルク量を増やす"
                onClick={() => setMilkMl((value) => stepMilkAmount(value, 1))}
              >
                <span className="text-3xl font-semibold">+</span>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Button
              variant={milkMethod === "bottle" ? "secondary" : "outline"}
              className="py-6 text-base"
              onClick={() => setMilkMethod("bottle")}
            >
              哺乳瓶
            </Button>
            <Button
              variant={milkMethod === "breast" ? "default" : "outline"}
              className="py-6 text-base"
              onClick={() => setMilkMethod("breast")}
            >
              母乳
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="milk-datetime" className="text-xs text-muted-foreground">
              時刻
            </Label>
            <Input
              id="milk-datetime"
              type="datetime-local"
              value={dateTimeValue}
              onChange={(e) => setDateTimeValue(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="milk-note" className="text-xs text-muted-foreground">
              メモ（任意）
            </Label>
            <Input
              id="milk-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例：途中でゲップ"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">キャンセル</Button>
          </DialogClose>
          <Button onClick={handleSave} className="bg-sky-600 hover:bg-sky-500">
            保存する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
