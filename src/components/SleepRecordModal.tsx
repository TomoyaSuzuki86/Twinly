import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { formatDateTimeLocalValue, parseDateTimeLocalValue } from "@/lib/entry-drafts";
import type { EventType } from "@/types";

type SleepRecordType = Extract<EventType, "sleepStart" | "wake">;

type SleepRecordModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  type: SleepRecordType;
  onSave: (timestamp: number) => void;
};

export function SleepRecordModal({
  open,
  onOpenChange,
  displayName,
  type,
  onSave,
}: SleepRecordModalProps) {
  const [timestamp, setTimestamp] = useState(() => Date.now());
  const label = type === "sleepStart" ? "入眠" : "起床";

  useEffect(() => {
    if (open) setTimestamp(Date.now());
  }, [open, type]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{displayName}: {label}時刻</DialogTitle>
          <DialogDescription>実際の{label}時刻に変更して記録できます。</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-3">
          <Label htmlFor="sleep-record-datetime">{label}日時</Label>
          <Input
            id="sleep-record-datetime"
            type="datetime-local"
            value={formatDateTimeLocalValue(timestamp)}
            onChange={(event) => {
              const nextTimestamp = parseDateTimeLocalValue(event.target.value);
              if (Number.isFinite(nextTimestamp)) setTimestamp(nextTimestamp);
            }}
          />
        </div>
        <DialogFooter className="flex-row justify-end gap-2 space-x-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button
            onClick={() => {
              onSave(timestamp);
              onOpenChange(false);
            }}
          >
            記録する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
