import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import type { EventType } from "@/types";
import { DateTimeAdjuster } from "./DateTimeAdjuster";

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
        <div className="py-3">
          <DateTimeAdjuster
            id="sleep-record-datetime"
            label={`${label}日時`}
            value={timestamp}
            onChange={setTimestamp}
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
