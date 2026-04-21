import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DiaperKind, LogEvent, MilkMethod } from "@/types";
import { useEffect, useState } from "react";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { clamp } from "@/lib/utils";

type EditModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: LogEvent | null;
  onSave: (eventId: string, payload: Partial<LogEvent>) => void;
};

const diaperKindOptions = [
  { k: "pee", label: "おしっこ" },
  { k: "poop", label: "うんち" },
] as const;

export function EditModal({ open, onOpenChange, event, onSave }: EditModalProps) {
  const [milkMl, setMilkMl] = useState(0);
  const [milkMethod, setMilkMethod] = useState<MilkMethod>("breast");
  const [diaperKind, setDiaperKind] = useState<DiaperKind>("pee");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (event) {
      setMilkMl(event.milkMl ?? 0);
      setMilkMethod(event.milkMethod ?? "breast");
      setDiaperKind(event.diaperKind ?? "pee");
      setNote(event.note ?? "");
    }
  }, [event]);

  const handleSave = () => {
    if (!event) return;
    const payload: Partial<LogEvent> =
      event.type === "milk"
        ? { milkMl, milkMethod, note }
        : event.type === "diaper"
        ? { diaperKind, note }
        : { note };
    onSave(event.id, payload);
    onOpenChange(false);
  };

  if (!event) return null;

  const requiresDiaperKindReselection = event.type === "diaper" && diaperKind === "mix";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>記録の編集</DialogTitle>
          <DialogDescription>記録内容を必要に応じて修正できます。</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {event.type === "milk" && (
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="font-semibold">ミルク</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>量 (ml)</Label>
                  <Input
                    type="number"
                    value={milkMl}
                    onChange={(e) => setMilkMl(clamp(Number(e.target.value || 0), 0, 999))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>種類</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={milkMethod === "bottle" ? "secondary" : "outline"}
                      onClick={() => setMilkMethod("bottle")}
                    >
                      哺乳瓶
                    </Button>
                    <Button
                      variant={milkMethod === "breast" ? "default" : "outline"}
                      onClick={() => setMilkMethod("breast")}
                    >
                      母乳
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {event.type === "diaper" && (
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="font-semibold">おむつ</h3>
              {requiresDiaperKindReselection ? (
                <p className="text-sm text-muted-foreground">
                  以前の「両方」記録です。保存する場合は「おしっこ」か「うんち」を選び直してください。
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                {diaperKindOptions.map((x) => (
                  <Button
                    key={x.k}
                    variant={diaperKind === x.k ? "default" : "outline"}
                    onClick={() => setDiaperKind(x.k)}
                  >
                    {x.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>メモ</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">キャンセル</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={requiresDiaperKindReselection}>
            保存する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
