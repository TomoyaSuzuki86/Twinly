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
import { BabyId, MilkMethod } from "@/types";
import { clamp } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Label } from "./ui/label";

type MilkModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  onSave: (payload: { milkMl: number; milkMethod: MilkMethod; note: string }) => void;
};

export function MilkModal({ open, onOpenChange, displayName, onSave }: MilkModalProps) {
  const [milkMl, setMilkMl] = useState(140);
  const [milkMethod, setMilkMethod] = useState<MilkMethod>("breast");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setMilkMl(140);
      setMilkMethod("breast");
      setNote("");
    }
  }, [open]);

  const handleSave = () => {
    onSave({ milkMl, milkMethod, note });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{displayName}: ミルク記録</DialogTitle>
        </DialogHeader>
        <div className="space-y-8 py-4">
          <div className="text-center">
            <Label className="text-sm font-semibold text-muted-foreground">
              量 (ml)
            </Label>
            <div className="mt-4 flex items-center justify-center gap-6">
              <Button
                variant="outline"
                size="icon"
                className="h-16 w-16 rounded-full"
                onClick={() => setMilkMl((v) => clamp(v - 10, 0, 999))}
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
                onClick={() => setMilkMl((v) => clamp(v + 10, 0, 999))}
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
            <Label className="text-xs text-muted-foreground">メモ（任意）</Label>
            <Input
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
