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
import { useEffect, useRef, useState } from "react";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { MilkDraft } from "@/lib/entry-drafts";
import { DateTimeAdjuster } from "./DateTimeAdjuster";
import { MilkAmountControl } from "./MilkAmountControl";
import type { MilkMethod } from "@/types";
import { Mic } from "lucide-react";
import { getSpeechRecognition, type SpeechRecognitionInstance } from "@/lib/speech-recognition";
import { mergeTranscriptSegments } from "@/lib/speech-transcript";
import { BreastfeedingDurationFields } from "./BreastfeedingDurationFields";

type MilkModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  isSleeping?: boolean;
  initialDraft: MilkDraft;
  onSave: (payload: { milkMl?: number; milkMethod: MilkMethod; breastLeftMinutes?: number; breastRightMinutes?: number; note: string; timestamp: number; autoWake: boolean }) => void;
  onSaveSolidFood?: (payload: { note: string; timestamp: number; autoWake: boolean }) => void;
};


export function MilkModal({
  open,
  onOpenChange,
  displayName,
  isSleeping = false,
  initialDraft,
  onSave,
  onSaveSolidFood,
}: MilkModalProps) {
  const [recordType, setRecordType] = useState<"milk" | "breast" | "solidFood">("milk");
  const [milkMl, setMilkMl] = useState(initialDraft.milkMl);
  const [breastLeftMinutes, setBreastLeftMinutes] = useState(initialDraft.breastLeftMinutes ?? 10);
  const [breastRightMinutes, setBreastRightMinutes] = useState(initialDraft.breastRightMinutes ?? 10);
  const [note, setNote] = useState(initialDraft.note);
  const [solidFoodNote, setSolidFoodNote] = useState("");
  const [timestamp, setTimestamp] = useState(initialDraft.timestamp);
  const [autoWake, setAutoWake] = useState(true);
  const [solidFoodListening, setSolidFoodListening] = useState(false);
  const solidFoodRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!justOpened) return;
    setRecordType("milk");
    setMilkMl(initialDraft.milkMl);
    setBreastLeftMinutes(initialDraft.breastLeftMinutes ?? 10);
    setBreastRightMinutes(initialDraft.breastRightMinutes ?? 10);
    setNote(initialDraft.note);
    setSolidFoodNote("");
    setTimestamp(initialDraft.timestamp);
    setAutoWake(true);
    setSolidFoodListening(false);
  }, [open, initialDraft]);

  useEffect(() => {
    if (open) return;
    solidFoodRecognitionRef.current?.abort();
    solidFoodRecognitionRef.current = null;
    setSolidFoodListening(false);
  }, [open]);

  const startSolidFoodDictation = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      window.alert("このブラウザは音声入力に未対応です");
      return;
    }

    solidFoodRecognitionRef.current?.abort();
    const recognition = new SpeechRecognition();
    solidFoodRecognitionRef.current = recognition;
    recognition.lang = "ja-JP";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    recognition.onstart = () => setSolidFoodListening(true);
    recognition.onerror = () => setSolidFoodListening(false);
    recognition.onend = () => {
      if (solidFoodRecognitionRef.current === recognition) solidFoodRecognitionRef.current = null;
      setSolidFoodListening(false);
    };
    recognition.onresult = (event) => {
      const segments: string[] = [];
      const startIndex = event.resultIndex ?? 0;
      for (let index = startIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result?.[0] ?? result?.item(0);
        const transcript = alternative?.transcript?.trim();
        if (transcript) segments.push(transcript);
      }
      const transcript = mergeTranscriptSegments(segments).trim();
      if (!transcript) return;
      setSolidFoodNote((current) => current.trim() ? `${current.trim()}、${transcript}` : transcript);
    };
    recognition.start();
  };

  const handleSave = () => {
    if (recordType === "solidFood") {
      onSaveSolidFood?.({ note: solidFoodNote.trim(), timestamp, autoWake });
      onOpenChange(false);
      return;
    }

    onSave(
      recordType === "breast"
        ? { milkMethod: "breast", breastLeftMinutes, breastRightMinutes, note, timestamp, autoWake }
        : { milkMethod: "bottle", milkMl, note, timestamp, autoWake }
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{displayName}: 食事記録</DialogTitle>
          <DialogDescription>ミルク・母乳・離乳食を選んで記録します。</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/40 p-1">
            <Button
              type="button"
              variant={recordType === "milk" ? "secondary" : "ghost"}
              className={recordType === "milk" ? "[color:hsl(var(--gauge-milk-text))]" : ""}
              onClick={() => setRecordType("milk")}
            >
              ミルク
            </Button>
            <Button
              type="button"
              variant={recordType === "breast" ? "secondary" : "ghost"}
              className={recordType === "breast" ? "text-pink-300" : ""}
              onClick={() => setRecordType("breast")}
            >
              母乳
            </Button>
            <Button
              type="button"
              variant={recordType === "solidFood" ? "secondary" : "ghost"}
              className={recordType === "solidFood" ? "text-emerald-300" : ""}
              onClick={() => setRecordType("solidFood")}
            >
              離乳食
            </Button>
          </div>

          {recordType === "milk" ? (
            <MilkAmountControl value={milkMl} onChange={setMilkMl} />
          ) : recordType === "breast" ? (
            <BreastfeedingDurationFields
              leftMinutes={breastLeftMinutes}
              rightMinutes={breastRightMinutes}
              onLeftChange={setBreastLeftMinutes}
              onRightChange={setBreastRightMinutes}
            />
          ) : (
            <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="solid-food-note" className="font-semibold text-emerald-200">メモ</Label>
                <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={startSolidFoodDictation} aria-label="離乳食メモを音声入力" title="音声でメモを入力">
                  <Mic className={`h-4 w-4 ${solidFoodListening ? "animate-pulse" : ""}`} />
                </Button>
              </div>
              <Textarea
                id="solid-food-note"
                value={solidFoodNote}
                onChange={(e) => setSolidFoodNote(e.target.value)}
                placeholder="例：10倍がゆ 小さじ2、にんじん 少し"
                className="min-h-28"
              />
              <p className="text-xs text-muted-foreground">食べたものや量、様子などを自由に記録できます。</p>
            </div>
          )}

          <DateTimeAdjuster id="feeding-datetime" value={timestamp} onChange={setTimestamp} />
          {isSleeping ? (
            <label
              htmlFor="feeding-auto-wake"
              className="flex cursor-pointer items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5"
            >
              <input
                id="feeding-auto-wake"
                type="checkbox"
                checked={autoWake}
                onChange={(event) => setAutoWake(event.target.checked)}
                className="h-5 w-5 accent-violet-500"
              />
              <span>
                <span className="block text-sm font-semibold">自動的に起床する</span>
                <span className="block text-xs text-muted-foreground">食事記録の15分前に起床を追加します</span>
              </span>
            </label>
          ) : null}
          {(recordType === "milk" || recordType === "breast") ? (
            <div className="space-y-2">
              <Label htmlFor="milk-note" className="text-xs text-muted-foreground">
                メモ（任意）
              </Label>
              <Input
                id="milk-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="機嫌や飲み方など"
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">キャンセル</Button>
          </DialogClose>
          <Button
            onClick={handleSave}
            disabled={recordType === "breast" && breastLeftMinutes === 0 && breastRightMinutes === 0}
            className={
              recordType === "solidFood"
                ? "bg-emerald-600 hover:bg-emerald-500"
                : "bg-sky-600 hover:bg-sky-500"
            }
          >
            保存する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
