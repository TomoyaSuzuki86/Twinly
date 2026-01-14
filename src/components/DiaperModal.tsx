import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DiaperKind } from "@/types";
import { useEffect, useState } from "react";
import { Label } from "./ui/label";

type DiaperModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  onSave: (payload: { diaperKind: DiaperKind; note: string }) => void;
};

const diaperKindOptions = [
  { k: "pee", label: "おしっこ" },
  { k: "poop", label: "うんち" },
  { k: "mix", label: "両方" },
] as const;

export function DiaperModal({ open, onOpenChange, displayName, onSave }: DiaperModalProps) {
  const [diaperKind, setDiaperKind] = useState<DiaperKind>("pee");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setDiaperKind("pee");
      setNote("");
    }
  }, [open]);

  const handleSave = () => {
    onSave({ diaperKind, note });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{displayName}: おむつ記録</DialogTitle>
        </DialogHeader>
        <div className="space-y-8 py-4">
          <div>
            <Label className="text-sm font-semibold text-muted-foreground">種類</Label>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {diaperKindOptions.map((x) => (
                <Button
                  key={x.k}
                  variant={diaperKind === x.k ? "default" : "outline"}
                  className="py-6 text-base"
                  onClick={() => setDiaperKind(x.k)}
                >
                  {x.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">メモ（任意）</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例：肌荒れ気味"
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
