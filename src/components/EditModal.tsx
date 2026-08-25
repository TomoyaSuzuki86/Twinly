import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DiaperKind, LogEvent } from "@/types";
import { useEffect, useState } from "react";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { clamp } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import { formatDateTimeLocalValue, parseDateTimeLocalValue } from "@/lib/entry-drafts";

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
  const [timestamp, setTimestamp] = useState(0);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  useEffect(() => {
    if (event) {
      setMilkMl(event.milkMl ?? 0);
      setDiaperKind(event.diaperKind ?? "pee");
      setNote(event.note ?? "");
      setTimestamp(event.timestamp);
      setDeleteConfirming(false);
    }
  }, [event]);

  const handleSave = () => {
    if (!event) return;
    const payload: Partial<LogEvent> =
      event.type === "milk"
        ? { milkMl, note, timestamp }
        : event.type === "diaper"
        ? { diaperKind, note, timestamp }
        : { note, timestamp };
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
            <Label htmlFor="edit-event-datetime">日時</Label>
            <Input
              id="edit-event-datetime"
              type="datetime-local"
              value={formatDateTimeLocalValue(timestamp)}
              onChange={(e) => {
                const nextTimestamp = parseDateTimeLocalValue(e.target.value);
                if (Number.isFinite(nextTimestamp)) setTimestamp(nextTimestamp);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>メモ</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="flex min-h-10 items-center justify-between gap-3 border-t pt-4">
          {deleteConfirming ? (
            <>
              <p className="text-sm font-semibold text-destructive" role="alert">削除しますか？</p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setDeleteConfirming(false)}>戻る</Button>
                <Button size="sm" variant="destructive" onClick={handleDelete}>削除する</Button>
              </div>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteConfirming(true)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                削除
              </Button>
              <div className="flex items-center gap-2">
                <DialogClose asChild>
                  <Button variant="ghost">キャンセル</Button>
                </DialogClose>
                <Button onClick={handleSave} disabled={requiresDiaperKindReselection}>
                  保存する
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
