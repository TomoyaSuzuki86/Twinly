import {
  Baby,
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
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BabyId, BabyProfile, LogEvent } from "@/types";
import { daysSince, fmtTime } from "@/lib/utils";
import { EventCard } from "./EventCard";
import { useEffect, useState } from "react";
import { Input } from "./ui/input";

type BabyPanelProps = {
  profile: BabyProfile;
  events: LogEvent[];
  lowStock: { size: string; remaining: number } | null;
  onOpenModal: (
    kind: "milk" | "diaper" | "edit",
    payload: { babyId: BabyId } | { eventId: string }
  ) => void;
  onDeleteEvent: (eventId: string) => void;
  onAddEvent: (
    event: Omit<LogEvent, "id" | "timestamp" | "calendarStatus">
  ) => void;
  lastWeight: number | null;
  lastHeight: number | null;
  themeDimmedBgColor: string;
};

const adjustNumber = (
  current: string,
  amount: number,
  precision: number
) => {
  const num = parseFloat(current);
  if (isNaN(num)) return (0).toFixed(precision);
  return (num + amount).toFixed(precision);
};

export function BabyPanel({
  profile,
  events,
  lowStock,
  onOpenModal,
  onDeleteEvent,
  onAddEvent,
  lastWeight,
  lastHeight,
  themeDimmedBgColor,
}: BabyPanelProps) {
  const p = profile;
  const babyId = p.babyId;

  const [temperature, setTemperature] = useState("36.0");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [dailyNote, setDailyNote] = useState("");

  useEffect(() => {
    if (lastWeight) {
      setWeight(lastWeight.toFixed(2));
    } else {
      setWeight("");
    }
  }, [lastWeight]);

  useEffect(() => {
    if (lastHeight) {
      setHeight(lastHeight.toFixed(1));
    } else {
      setHeight("");
    }
  }, [lastHeight]);

  const handleSaveHealthRecord = (type: "temperature" | "weight" | "height") => {
    if (type === "temperature" && temperature) {
      onAddEvent({
        babyId,
        type: "temperature",
        temperature: parseFloat(temperature),
      });
      setTemperature("36.0"); // Reset to default
    }
    if (type === "weight" && weight) {
      onAddEvent({
        babyId,
        type: "weight",
        weight: parseFloat(weight),
      });
      // Do not reset weight, it will be updated by useEffect
    }
    if (type === "height" && height) {
      onAddEvent({
        babyId,
        type: "height",
        height: parseFloat(height),
      });
      // Do not reset height, it will be updated by useEffect
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

  const milkEvents = events.filter((e) => e.type === "milk");
  const diaperEvents = events.filter((e) => e.type === "diaper");

  const milkTotal = milkEvents.reduce((sum, e) => sum + (e.milkMl ?? 0), 0);
  const diaperCount = diaperEvents.length;
  const rem = p.diaperStockBySize[p.diaperSize] ?? 0;

  const purchaseUrl = p.diaperPurchaseUrl?.trim();

  const lastMilkEvent = milkEvents.length > 0 ? milkEvents[0] : null;
  const lastMilkTime = lastMilkEvent
    ? fmtTime(new Date(lastMilkEvent.timestamp))
    : "-";

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
            <span className="mt-1 text-base font-normal opacity-80">
              最終: {lastMilkTime}
            </span>
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
              {p.diaperSize}・残り {rem}
            </span>
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* One-line Diary Input */}
          <div className="flex items-center gap-2 rounded-lg border bg-card p-2 justify-between sm:col-span-2">
            <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground flex-shrink-0">
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
              className="flex-1 text-sm h-7 px-2"
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

          {/* Temperature Input */}
          <div className="flex items-center gap-1 rounded-lg border bg-card p-2 justify-between">
            <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground flex-shrink-0">
              <Thermometer className="h-4 w-4" />
              <span>体温</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setTemperature((t) => adjustNumber(t, -0.5, 1))}
            >
              <ChevronsLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setTemperature((t) => adjustNumber(t, -0.1, 1))}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Input
              type="number"
              placeholder="36.0"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              className="w-20 text-center text-base font-bold h-7 px-1"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setTemperature((t) => adjustNumber(t, 0.1, 1))}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setTemperature((t) => adjustNumber(t, 0.5, 1))}
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

          {/* Weight Input */}
          <div className="flex items-center gap-1 rounded-lg border bg-card p-2 justify-between">
            <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground flex-shrink-0">
              <Weight className="h-4 w-4" />
              <span>体重</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setWeight((w) => adjustNumber(w, -0.5, 2))}
            >
              <ChevronsLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setWeight((w) => adjustNumber(w, -0.1, 2))}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Input
              type="number"
              placeholder={lastWeight?.toFixed(2) ?? "0.00"}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-20 text-center text-base font-bold h-7 px-1"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setWeight((w) => adjustNumber(w, 0.1, 2))}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setWeight((w) => adjustNumber(w, 0.5, 2))}
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

          {/* Height Input */}
          <div className="flex items-center gap-1 rounded-lg border bg-card p-2 justify-between">
            <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground flex-shrink-0">
              <Ruler className="h-4 w-4" />
              <span>身長</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setHeight((h) => adjustNumber(h, -0.5, 1))}
            >
              <ChevronsLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setHeight((h) => adjustNumber(h, -0.1, 1))}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Input
              type="number"
              placeholder={lastHeight?.toFixed(1) ?? "0.0"}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="w-20 text-center text-base font-bold h-7 px-1"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setHeight((h) => adjustNumber(h, 0.1, 1))}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-10"
              onClick={() => setHeight((h) => adjustNumber(h, 0.5, 1))}
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
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-base font-medium text-muted-foreground">
                ミルク合計
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-sky-300">
                  {milkTotal}
                </span>
                <span className="font-semibold text-muted-foreground">ml</span>
                <span className="ml-auto text-sm text-muted-foreground">
                  {milkEvents.length}回
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-base font-medium text-muted-foreground">
                おむつ
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-amber-300">
                  {diaperCount}
                </span>
                <span className="font-semibold text-muted-foreground">回</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-3">
        <h3 className="text-sm font-semibold text-muted-foreground">
          今日のログ
        </h3>
        <div className="flex w-full flex-col gap-3">
          {events.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">
              まだ記録がありません
            </div>
          ) : (
            events
              .slice(0, 4)
              .map((event) => (
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
