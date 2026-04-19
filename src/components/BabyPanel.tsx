import {
  Milk,
  Droplets,
  Thermometer,
  Weight,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Check,
  Ruler,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BabyId, BabyProfile, LogEvent } from "@/types";
import { fmtTime, minutesSince } from "@/lib/utils";
import { EventCard } from "./EventCard";
import { useEffect, useState } from "react";
import { Input } from "./ui/input";

type BabyPanelProps = {
  profile: BabyProfile;
  events: LogEvent[];
  lowStock: { size: string; remaining: number } | null;
  onOpenHistory: (type: "milk" | "diaper", babyId: BabyId) => void;
  onOpenModal: (
    kind: "milk" | "diaper" | "edit",
    payload: { babyId: BabyId } | { eventId: string }
  ) => void;
  onDeleteEvent: (eventId: string) => void;
  onAddEvent: (event: Omit<LogEvent, "id" | "timestamp">) => void;
  lastWeight: number | null;
  lastHeight: number | null;
  themeDimmedBgColor: string;
};

const adjustNumber = (current: string, amount: number, precision: number) => {
  const num = parseFloat(current);
  if (isNaN(num)) return (0).toFixed(precision);
  return (num + amount).toFixed(precision);
};

export function BabyPanel({
  profile,
  events,
  lowStock,
  onOpenHistory,
  onOpenModal,
  onDeleteEvent,
  onAddEvent,
  lastWeight,
  lastHeight,
  themeDimmedBgColor,
}: BabyPanelProps) {
  const babyId = profile.babyId;
  const [temperature, setTemperature] = useState("36.0");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [dailyNote, setDailyNote] = useState("");

  useEffect(() => {
    setWeight(lastWeight ? lastWeight.toFixed(2) : "");
  }, [lastWeight]);

  useEffect(() => {
    setHeight(lastHeight ? lastHeight.toFixed(1) : "");
  }, [lastHeight]);

  const handleSaveHealthRecord = (type: "temperature" | "weight" | "height") => {
    if (type === "temperature" && temperature) {
      onAddEvent({
        babyId,
        type: "temperature",
        temperature: parseFloat(temperature),
      });
      setTemperature("36.0");
    }
    if (type === "weight" && weight) {
      onAddEvent({
        babyId,
        type: "weight",
        weight: parseFloat(weight),
      });
    }
    if (type === "height" && height) {
      onAddEvent({
        babyId,
        type: "height",
        height: parseFloat(height),
      });
    }
  };

  const handleSaveDailyNote = () => {
    const note = dailyNote.trim();
    if (!note) return;
    onAddEvent({
      babyId,
      type: "daily",
      note,
    });
    setDailyNote("");
  };

  const milkEvents = events.filter((event) => event.type === "milk");
  const diaperEvents = events.filter((event) => event.type === "diaper");
  const milkTotal = milkEvents.reduce((sum, event) => sum + (event.milkMl ?? 0), 0);
  const diaperCount = diaperEvents.length;
  const remainingDiapers = profile.diaperStockBySize[profile.diaperSize] ?? 0;
  const purchaseUrl = profile.diaperPurchaseUrl?.trim();

  const lastMilkEvent = milkEvents[0] ?? null;
  const lastMilkTime = lastMilkEvent ? fmtTime(new Date(lastMilkEvent.timestamp)) : "-";
  const lastMilkElapsed = lastMilkEvent ? `${minutesSince(lastMilkEvent.timestamp)}分経過` : "未記録";

  const lastDiaperEvent = diaperEvents[0] ?? null;
  const lastDiaperTime = lastDiaperEvent ? fmtTime(new Date(lastDiaperEvent.timestamp)) : "-";
  const lastDiaperElapsed = lastDiaperEvent ? `${minutesSince(lastDiaperEvent.timestamp)}分経過` : "未記録";

  return (
    <Card className={`flex flex-col border-border/60 ${themeDimmedBgColor}`}>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-4">
          <Button
            size="lg"
            className="h-24 flex-col bg-sky-600 text-2xl font-bold hover:bg-sky-500"
            onClick={() => onOpenModal("milk", { babyId })}
          >
            <div className="flex items-center">
              <Milk className="mr-3 h-7 w-7" />
              ミルク
            </div>
            <span className="mt-1 text-base font-normal opacity-80">前回 {lastMilkTime}</span>
            <span className="text-sm font-normal opacity-80">{lastMilkElapsed}</span>
          </Button>
          <Button
            size="lg"
            className="h-24 flex-col bg-amber-600 text-2xl font-bold hover:bg-amber-500"
            onClick={() => onOpenModal("diaper", { babyId })}
          >
            <div className="flex items-center">
              <Droplets className="mr-3 h-7 w-7" />
              おむつ
            </div>
            <span className="mt-1 text-base font-normal opacity-80">
              {profile.diaperSize}・残り {remainingDiapers}
            </span>
            <span className="text-sm font-normal opacity-80">
              前回 {lastDiaperTime} / {lastDiaperElapsed}
            </span>
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2 sm:col-span-2">
            <div className="flex flex-shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>一言日記</span>
            </div>
            <Input
              type="text"
              placeholder="ひとことメモ"
              value={dailyNote}
              onChange={(e) => setDailyNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveDailyNote();
              }}
              className="h-7 flex-1 px-2 text-sm"
            />
            <Button
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={handleSaveDailyNote}
              disabled={!dailyNote.trim()}
            >
              <Check className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center justify-between gap-1 rounded-lg border bg-card p-2">
            <div className="flex flex-shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground">
              <Thermometer className="h-4 w-4" />
              <span>体温</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setTemperature((value) => adjustNumber(value, -0.5, 1))}
            >
              <ChevronsLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setTemperature((value) => adjustNumber(value, -0.1, 1))}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Input
              type="number"
              placeholder="36.0"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              className="h-7 w-20 px-1 text-center text-base font-bold"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setTemperature((value) => adjustNumber(value, 0.1, 1))}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setTemperature((value) => adjustNumber(value, 0.5, 1))}
            >
              <ChevronsRight className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={() => handleSaveHealthRecord("temperature")}
              disabled={!temperature}
            >
              <Check className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center justify-between gap-1 rounded-lg border bg-card p-2">
            <div className="flex flex-shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground">
              <Weight className="h-4 w-4" />
              <span>体重</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setWeight((value) => adjustNumber(value, -0.5, 2))}
            >
              <ChevronsLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setWeight((value) => adjustNumber(value, -0.1, 2))}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Input
              type="number"
              placeholder={lastWeight?.toFixed(2) ?? "0.00"}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="h-7 w-20 px-1 text-center text-base font-bold"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setWeight((value) => adjustNumber(value, 0.1, 2))}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setWeight((value) => adjustNumber(value, 0.5, 2))}
            >
              <ChevronsRight className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={() => handleSaveHealthRecord("weight")}
              disabled={!weight}
            >
              <Check className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center justify-between gap-1 rounded-lg border bg-card p-2">
            <div className="flex flex-shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground">
              <Ruler className="h-4 w-4" />
              <span>身長</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setHeight((value) => adjustNumber(value, -0.5, 1))}
            >
              <ChevronsLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setHeight((value) => adjustNumber(value, -0.1, 1))}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Input
              type="number"
              placeholder={lastHeight?.toFixed(1) ?? "0.0"}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="h-7 w-20 px-1 text-center text-base font-bold"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setHeight((value) => adjustNumber(value, 0.1, 1))}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setHeight((value) => adjustNumber(value, 0.5, 1))}
            >
              <ChevronsRight className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={() => handleSaveHealthRecord("height")}
              disabled={!height}
            >
              <Check className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      <CardHeader className="pt-0">
        <div className="flex flex-wrap items-center gap-2">
          {lowStock ? <Badge variant="destructive">残りわずか</Badge> : null}
          {lowStock && purchaseUrl ? (
            <a href={purchaseUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                購入サイトへ
              </Button>
            </a>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="flex-grow space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            className="text-left"
            onClick={() => onOpenHistory("milk", babyId)}
            aria-label={`${profile.displayName}のミルク履歴を開く`}
          >
            <Card className="transition-colors hover:border-sky-400/60 hover:bg-sky-500/5">
              <CardHeader className="p-4">
                <CardTitle className="text-base font-medium text-muted-foreground">ミルク合計</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-sky-300">{milkTotal}</span>
                  <span className="font-semibold text-muted-foreground">ml</span>
                  <span className="ml-auto text-sm text-muted-foreground">{milkEvents.length}回</span>
                </div>
              </CardContent>
            </Card>
          </button>
          <button
            type="button"
            className="text-left"
            onClick={() => onOpenHistory("diaper", babyId)}
            aria-label={`${profile.displayName}のおむつ履歴を開く`}
          >
            <Card className="transition-colors hover:border-amber-400/60 hover:bg-amber-500/5">
              <CardHeader className="p-4">
                <CardTitle className="text-base font-medium text-muted-foreground">おむつ</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-amber-300">{diaperCount}</span>
                  <span className="font-semibold text-muted-foreground">回</span>
                </div>
              </CardContent>
            </Card>
          </button>
        </div>
      </CardContent>

      <CardFooter className="flex min-h-0 flex-1 flex-col items-start gap-3">
        <h3 className="text-sm font-semibold text-muted-foreground">今日のログ</h3>
        <div className="flex max-h-[42vh] w-full flex-col gap-3 overflow-y-auto pr-1">
          {events.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">
              まだ記録がありません
            </div>
          ) : (
            events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onEdit={() => onOpenModal("edit", { eventId: event.id })}
                onDelete={() => onDeleteEvent(event.id)}
              />
            ))
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
