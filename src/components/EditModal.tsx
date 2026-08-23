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
import { DiaperKind, LogEvent } from "@/types";
import { useEffect, useState } from "react";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { clamp } from "@/lib/utils";

type EditModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: LogEvent | null;
  onSave: (eventId: string, payload: Partial<LogEvent>) => void;
  onDelete: (eventId: string) => void;
};

const diaperKindOptions = [
  { k: "pee", label: "おしっこ" },
  { k: "poop", label: "うんち" },
] as const;

export function EditModal({ open, onOpenChange, event, onSave, onDelete }: EditModalProps) {
  const [milkMl, setMilkMl] = useState(0);
  const [diaperKind, setDiaperKind] = useState<DiaperKind>("pee");
  const [note, setNote] = useState("");
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  useEffect(() => {
    if (event) {
      setMilkMl(event.milkMl ?? 0);
      setDiaperKind(event.diaperKind ?? "pee");
      setNote(event.note ?? "");
      setDeleteConfirming(false);
    }
  }, [event]);

  const handleSave = () => {
    if (!event) return;
    const payload: Partial<LogEvent> =
      event.type === "milk"
        ? { milkMl, note }
        : event.type === "diaper"
        ? { diaperKind, note }
        : { note };
    onSave(event.id, payload);
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!event) return;
    onDelete(event.id);
    setDeleteConfirming(false);
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
              <div className="space-y-2">
                <Label>量 (ml)</Label>
                <Input
                  type="number"
                  value={milkMl}
                  onChange={(e) => setMilkMl(clamp(Number(e.target.value || 0), 0, 999))}
                />
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
          {event.type === "solidFood" ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <h3 className="font-semibold text-emerald-200">離乳食</h3>
              <p className="mt-1 text-sm text-muted-foreground">食べたものや量、様子はメモで編集できます。</p>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>メモ</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {deleteConfirming ? (
          <div className="space-y-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4" role="alert">
            <p className="font-semibold">この記録を削除しますか？</p>
            <p className="text-sm text-muted-foreground">削除した記録は元に戻せません。</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteConfirming(false)}>削除を中止</Button>
              <Button variant="destructive" onClick={handleDelete}>削除を確定</Button>
            </div>
          </div>
        ) : (
          <DialogFooter className="sm:justify-between sm:space-x-0">
            <Button variant="destructive" onClick={() => setDeleteConfirming(true)}>削除する</Button>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">キャンセル</Button>
              </DialogClose>
              <Button onClick={handleSave} disabled={requiresDiaperKindReselection}>
                保存する
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
