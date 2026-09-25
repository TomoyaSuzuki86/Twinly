import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DiaperKind, LogEvent } from "@/types";
import { useEffect, useRef, useState } from "react";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Copy, Trash2 } from "lucide-react";
import { DateTimeAdjuster } from "./DateTimeAdjuster";
import { MilkAmountControl } from "./MilkAmountControl";
import { BreastfeedingDurationFields } from "./BreastfeedingDurationFields";

type EditModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: LogEvent | null;
  onSave: (eventId: string, payload: Partial<LogEvent>) => void;
  onDelete: (eventId: string) => void;
  onCopyToTwin?: (event: LogEvent, payload: Partial<LogEvent>) => boolean | void;
  isTwinCopyDuplicate?: (event: LogEvent, payload: Partial<LogEvent>) => boolean;
  memberNameByUid?: Record<string, string>;
};

const diaperKindOptions = [
  { k: "pee", label: "おしっこ" },
  { k: "poop", label: "うんち" },
] as const;

export function EditModal({
  open,
  onOpenChange,
  event,
  onSave,
  onDelete,
  onCopyToTwin,
  isTwinCopyDuplicate,
  memberNameByUid = {},
}: EditModalProps) {
  const [milkMl, setMilkMl] = useState(0);
  const [breastLeftActive, setBreastLeftActive] = useState(true);
  const [breastRightActive, setBreastRightActive] = useState(true);
  const [breastLeftMinutes, setBreastLeftMinutes] = useState(10);
  const [breastRightMinutes, setBreastRightMinutes] = useState(10);
  const [diaperKind, setDiaperKind] = useState<DiaperKind>("pee");
  const [note, setNote] = useState("");
  const [timestamp, setTimestamp] = useState(0);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [copiedToTwin, setCopiedToTwin] = useState(false);
  const initializedEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !event) {
      initializedEventIdRef.current = null;
      return;
    }

    // Firestore/sync refreshes replace app.events with new object instances even when
    // the same record is still being edited. Re-initializing from every new object
    // discards the user's unsaved milk amount/note. Initialize only when the editor
    // opens for a record, or when it switches to a different record id.
    if (initializedEventIdRef.current === event.id) return;
    initializedEventIdRef.current = event.id;

      setMilkMl(event.milkMl ?? 0);
      setBreastLeftActive((event.breastLeftMinutes ?? 10) > 0);
      setBreastRightActive((event.breastRightMinutes ?? 10) > 0);
      setBreastLeftMinutes(event.breastLeftMinutes && event.breastLeftMinutes > 0 ? event.breastLeftMinutes : 10);
      setBreastRightMinutes(event.breastRightMinutes && event.breastRightMinutes > 0 ? event.breastRightMinutes : 10);
      setDiaperKind(event.diaperKind ?? "pee");
      setNote(event.note ?? "");
      setTimestamp(event.timestamp);
      setDeleteConfirming(false);
      setCopiedToTwin(false);
  }, [open, event]);

  const handleSave = () => {
    if (!event) return;
    const payload: Partial<LogEvent> =
      event.type === "milk"
        ? event.milkMethod === "breast"
          ? { milkMethod: "breast", breastLeftMinutes: breastLeftActive ? breastLeftMinutes : 0, breastRightMinutes: breastRightActive ? breastRightMinutes : 0, note, timestamp }
          : { milkMl, milkMethod: "bottle", note, timestamp }
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
  const invalidBreastfeeding =
    event.type === "milk" &&
    event.milkMethod === "breast" &&
    !breastLeftActive &&
    !breastRightActive;
  const supportsTwinCopy =
    event.type === "milk" ||
    event.type === "diaper" ||
    event.type === "daily" ||
    event.type === "sleepStart" ||
    event.type === "wake";

  const twinCopyPayload: Partial<LogEvent> =
    event.type === "milk"
      ? event.milkMethod === "breast"
        ? {
            milkMethod: "breast",
            breastLeftMinutes: breastLeftActive ? breastLeftMinutes : 0,
            breastRightMinutes: breastRightActive ? breastRightMinutes : 0,
            note,
            timestamp,
          }
        : { milkMl, milkMethod: "bottle", note, timestamp }
      : event.type === "diaper"
      ? {
          diaperKind,
          diaperSizeUsed: event.diaperSizeUsed,
          note,
          timestamp,
        }
      : event.type === "daily"
      ? {
          note,
          timestamp,
          customMemoId: event.customMemoId,
          customMemoEmoji: event.customMemoEmoji,
        }
      : { note, timestamp };

  const alreadyOnTwin =
    supportsTwinCopy &&
    Boolean(onCopyToTwin) &&
    Boolean(isTwinCopyDuplicate?.(event, twinCopyPayload));
  const twinCopyDisabled =
    copiedToTwin ||
    alreadyOnTwin ||
    requiresDiaperKindReselection ||
    invalidBreastfeeding;

  const handleCopyToTwin = () => {
    if (!supportsTwinCopy || !onCopyToTwin || twinCopyDisabled) return;
    const copied = onCopyToTwin(event, twinCopyPayload);
    if (copied !== false) setCopiedToTwin(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[70]">
        <DialogHeader>
          <DialogTitle>記録の編集</DialogTitle>
          <DialogDescription>記録内容を必要に応じて修正できます。</DialogDescription>
        </DialogHeader>
        {supportsTwinCopy && onCopyToTwin ? (
          <div className="flex justify-start">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={handleCopyToTwin}
              disabled={twinCopyDisabled}
            >
              <Copy className="mr-1.5 h-4 w-4" />
              {copiedToTwin || alreadyOnTwin ? "コピー済み" : "もう片方にもコピー"}
            </Button>
          </div>
        ) : null}
        {event.createdByUid ? (
          <div className="text-xs text-muted-foreground">
            記録：{memberNameByUid[event.createdByUid] ?? "家族メンバー"}
            {event.updatedByUid && event.updatedByUid !== event.createdByUid
              ? ` ／ 更新：${memberNameByUid[event.updatedByUid] ?? "家族メンバー"}`
              : ""}
          </div>
        ) : null}
        <div className="space-y-6 py-4">
          {event.type === "milk" && (
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="font-semibold">{event.milkMethod === "breast" ? "母乳" : "ミルク"}</h3>
              {event.milkMethod === "breast" ? (
                <BreastfeedingDurationFields
                  leftActive={breastLeftActive}
                  rightActive={breastRightActive}
                  leftMinutes={breastLeftMinutes}
                  rightMinutes={breastRightMinutes}
                  onLeftActiveChange={setBreastLeftActive}
                  onRightActiveChange={setBreastRightActive}
                  onLeftChange={setBreastLeftMinutes}
                  onRightChange={setBreastRightMinutes}
                />
              ) : (
                <MilkAmountControl id="edit-milk-amount" value={milkMl} onChange={setMilkMl} />
              )}
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
          <DateTimeAdjuster id="edit-event-datetime" value={timestamp} onChange={setTimestamp} />
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
                <Button onClick={handleSave} disabled={requiresDiaperKindReselection || invalidBreastfeeding}>
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
