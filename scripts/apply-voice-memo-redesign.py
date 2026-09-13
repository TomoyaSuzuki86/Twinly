from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one match, found {count}: {old[:80]!r}")
    write(path, content.replace(old, new, 1))


def replace_all_checked(path: str, old: str, new: str, minimum: int = 1) -> None:
    content = read(path)
    count = content.count(old)
    if count < minimum:
        raise RuntimeError(f"{path}: expected at least {minimum} matches, found {count}: {old[:80]!r}")
    write(path, content.replace(old, new))


# 1) Event metadata for paired/shared daily notes.
replace_once(
    "src/types.ts",
    r'''  note?: string;
  createdByUid?: string;''',
    r'''  note?: string;
  sharedDailyId?: string;
  createdByUid?: string;''',
)

# 2) Voice parser: the invocation point owns targeting. Name detection remains only as a
# legacy fallback for direct parser callers, but every UI recording session now supplies
# an explicit A/B/both target.
replace_once(
    "src/lib/voice-command.ts",
    r'''      babyId: BabyId;
      type: "daily";
      dailyNote: string;
      timestamp: number;
      note: string;''',
    r'''      babyId: VoiceCommandTarget;
      type: "daily";
      dailyNote: string;
      timestamp: number;
      note: string;
      fallbackMemo?: boolean;''',
)
replace_once(
    "src/lib/voice-command.ts",
    r'''  forcedBabyId?: BabyId;''',
    r'''  forcedBabyId?: VoiceCommandTarget;''',
)
replace_once(
    "src/lib/voice-command.ts",
    r'''const detectDailyNote = (originalText: string) => {
  const match = originalText.match(/(?:ひとこと|一言|めも|メモ)(?:は|を|:|：)?\s*(.+)$/i);
  return match?.[1]?.trim() || originalText.trim();
};''',
    r'''const detectDailyNote = (originalText: string, preservePrefix = false) => {
  if (!preservePrefix) {
    const match = originalText.match(/(?:ひとこと|一言|めも|メモ)(?:は|を|:|：)?\s*(.+)$/i);
    return match?.[1]?.trim() || originalText.trim();
  }

  const match = originalText.match(/^(.*?)(?:ひとこと|一言|めも|メモ)(?:は|を|:|：)?\s*(.*)$/i);
  if (!match) return originalText.trim();
  return [match[1]?.trim(), match[2]?.trim()].filter(Boolean).join(" ") || originalText.trim();
};''',
)
replace_once(
    "src/lib/voice-command.ts",
    r'''  const babyNames = options.babyNames ?? {};
  const now = options.now ?? new Date();
  const normalizedText = normalizeText(text);
  const babyId = options.forcedBabyId ?? detectBabyId(normalizedText, babyNames);
  const timestamp = detectTimestamp(normalizedText, now) ?? now.getTime();
  const targetBabyId: VoiceCommandTarget = babyId ?? "both";''',
    r'''  const babyNames = options.babyNames ?? {};
  const now = options.now ?? new Date();
  const normalizedText = normalizeText(text);
  const explicitTarget = options.forcedBabyId;
  const detectedBabyId = explicitTarget === undefined ? detectBabyId(normalizedText, babyNames) : null;
  const targetBabyId: VoiceCommandTarget = explicitTarget ?? detectedBabyId ?? "both";
  const singleBabyId: BabyId | null = targetBabyId === "both" ? null : targetBabyId;
  const timestamp = detectTimestamp(normalizedText, now) ?? now.getTime();''',
)
replace_once(
    "src/lib/voice-command.ts",
    r'''  if (isDailyNote) {
    if (!babyId) return { ok: false, reason: "missingBaby", normalizedText };

    return {
      ok: true,
      command: {
        kind: "event",
        babyId,
        type: "daily",
        dailyNote: detectDailyNote(text),
        timestamp,
        note: `voice: ${text}`,
      },
    };
  }''',
    r'''  if (isDailyNote) {
    if (!singleBabyId && explicitTarget === undefined) {
      return { ok: false, reason: "missingBaby", normalizedText };
    }

    return {
      ok: true,
      command: {
        kind: "event",
        babyId: targetBabyId,
        type: "daily",
        dailyNote: detectDailyNote(text, explicitTarget !== undefined),
        timestamp,
        note: `voice: ${text}`,
      },
    };
  }''',
)
for kind in ["temperature", "weight", "height"]:
    replace_once(
        "src/lib/voice-command.ts",
        f'''  if (is{kind.capitalize()}) {{\n    if (!babyId) return {{ ok: false, reason: "missingBaby", normalizedText }};''',
        f'''  if (is{kind.capitalize()}) {{\n    if (!singleBabyId) return {{ ok: false, reason: "missingBaby", normalizedText }};''',
    )
    replace_once(
        "src/lib/voice-command.ts",
        f'''        babyId,\n        type: "{kind}",''',
        f'''        babyId: singleBabyId,\n        type: "{kind}",''',
    )
replace_once(
    "src/lib/voice-command.ts",
    r'''  return { ok: false, reason: "missingType", normalizedText };
};

export const selectVoiceCommandFromAlternatives''',
    r'''  if (explicitTarget !== undefined && text.trim()) {
    return {
      ok: true,
      command: {
        kind: "event",
        babyId: targetBabyId,
        type: "daily",
        dailyNote: text.trim(),
        timestamp,
        note: `voice: ${text}`,
        fallbackMemo: true,
      },
    };
  }

  return { ok: false, reason: "missingType", normalizedText };
};

export const selectVoiceCommandFromAlternatives''',
)
replace_once(
    "src/lib/voice-command.ts",
    r'''  const namedMatch = parsedResults.find(
    (result) => result.ok && result.command.babyId !== "both"
  );
  if (namedMatch) return namedMatch;

  const anyMatch = parsedResults.find((result) => result.ok);''',
    r'''  const typedMatch = parsedResults.find(
    (result) => result.ok && !(result.command.type === "daily" && result.command.fallbackMemo)
  );
  if (typedMatch) return typedMatch;

  if (options.forcedBabyId === undefined) {
    const namedMatch = parsedResults.find(
      (result) => result.ok && result.command.babyId !== "both"
    );
    if (namedMatch) return namedMatch;
  }

  const anyMatch = parsedResults.find((result) => result.ok);''',
)

# 3) Speech button: default/global target is explicitly both. Inline memo can reuse the
# recognition engine in transcript-only mode and size it to the compact memo row.
replace_once(
    "src/components/VoiceCommandButton.tsx",
    r'''  VoiceCommand,
  VoiceCommandBabyNames,
  VoiceCommandParseResult,''',
    r'''  VoiceCommand,
  VoiceCommandBabyNames,
  VoiceCommandParseResult,
  VoiceCommandTarget,''',
)
replace_once(
    "src/components/VoiceCommandButton.tsx",
    r'''  onTranscript?: (text: string) => void;
};''',
    r'''  onTranscript?: (text: string) => void;
  className?: string;
};''',
)
replace_once(
    "src/components/VoiceCommandButton.tsx",
    r'''export type VoiceCommandButtonHandle = {
  startListening: (forcedBabyId?: BabyId) => void;
};''',
    r'''export type VoiceCommandButtonHandle = {
  startListening: (forcedBabyId?: VoiceCommandTarget) => void;
};''',
)
replace_once(
    "src/components/VoiceCommandButton.tsx",
    r'''  if (reason === "missingBaby") return "A/Bが聞き取れませんでした";''',
    r'''  if (reason === "missingBaby") return "この記録は赤ちゃんタブから音声入力してください";''',
)
replace_once(
    "src/components/VoiceCommandButton.tsx",
    r'''  { babyNames, defaultMilkMlByBaby, onCommand, onMessage, onTranscript },''',
    r'''  { babyNames, defaultMilkMlByBaby, onCommand, onMessage, onTranscript, className },''',
)
replace_once(
    "src/components/VoiceCommandButton.tsx",
    r'''  const forcedBabyIdRef = useRef<BabyId | undefined>(undefined);''',
    r'''  const forcedBabyIdRef = useRef<VoiceCommandTarget | undefined>(undefined);''',
)
replace_once(
    "src/components/VoiceCommandButton.tsx",
    r'''  const startListening = (forcedBabyId?: BabyId) => {''',
    r'''  const startListening = (forcedBabyId: VoiceCommandTarget = "both") => {''',
)
replace_once(
    "src/components/VoiceCommandButton.tsx",
    r'''      variant={listening ? "default" : "ghost"}
      size="icon"
      onClick={() => (listening ? stopListening() : startListening())}''',
    r'''      variant={listening ? "default" : "ghost"}
      size="icon"
      className={className}
      onClick={() => (listening ? stopListening() : startListening())}''',
)

# 4) One-line memo UI: empty => mic, transcribed text => check/save.
replace_once(
    "src/components/BabyPanel.tsx",
    r'''import { EventCard } from "./EventCard";''',
    r'''import { EventCard } from "./EventCard";
import { VoiceCommandButton } from "./VoiceCommandButton";''',
)
replace_once(
    "src/components/BabyPanel.tsx",
    r'''  onOpenTimeline: () => void;
  lastWeight: number | null;''',
    r'''  onOpenTimeline: () => void;
  onVoiceMessage?: (message: string) => void;
  lastWeight: number | null;''',
)
replace_once(
    "src/components/BabyPanel.tsx",
    r'''  onOpenTimeline,
  lastWeight,''',
    r'''  onOpenTimeline,
  onVoiceMessage = () => {},
  lastWeight,''',
)
replace_once(
    "src/components/BabyPanel.tsx",
    r'''            <Button size="icon" className="h-7 w-7 flex-shrink-0" onClick={handleSaveDailyNote} disabled={!dailyNote.trim()}>
              <Check className="h-4 w-4" />
            </Button>''',
    r'''            {dailyNote.trim() ? (
              <Button
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={handleSaveDailyNote}
                aria-label="一言メモを保存"
              >
                <Check className="h-4 w-4" />
              </Button>
            ) : (
              <VoiceCommandButton
                className="h-7 w-7 flex-shrink-0"
                onCommand={() => {}}
                onMessage={onVoiceMessage}
                onTranscript={(text) => setDailyNote(text.trim())}
              />
            )}''',
)

# 5) App behavior: shared notes are mirrored as an atomic pair. Editing/deleting either
# mirror updates/deletes both. This keeps existing A/B event indexes and panel filtering intact.
replace_once(
    "src/App.tsx",
    r'''    if (command.type === "daily") {
      createdEvents.push(
        createEvent(command.babyId, "daily", {
          timestamp: command.timestamp,
          note: command.dailyNote,
        })
      );
    }''',
    r'''    if (command.type === "daily") {
      if (command.babyId === "both") {
        const sharedDailyId = uid();
        (["A", "B"] as BabyId[]).forEach((babyId) => {
          createdEvents.push(
            createEvent(babyId, "daily", {
              timestamp: command.timestamp,
              note: command.dailyNote,
              sharedDailyId,
            })
          );
        });
      } else {
        createdEvents.push(
          createEvent(command.babyId, "daily", {
            timestamp: command.timestamp,
            note: command.dailyNote,
          })
        );
      }
    }''',
)
replace_once(
    "src/App.tsx",
    r'''      const updatedEvent = { ...originalEvent, ...auditPayload };
      const nextEvents = prevApp.events.map((event) => (event.id === eventId ? updatedEvent : event));
      return { ...prevApp, events: nextEvents };''',
    r'''      const sharedDailyId = originalEvent.sharedDailyId;
      const nextEvents = prevApp.events.map((event) => {
        const sameRecord = event.id === eventId || (sharedDailyId && event.sharedDailyId === sharedDailyId);
        return sameRecord ? { ...event, ...auditPayload } : event;
      });
      return { ...prevApp, events: nextEvents };''',
)
replace_once(
    "src/App.tsx",
    r'''  const removeEvent = (eventId: string) => {
    if (!authUser || !db) return;
    updateApp((prevApp) => removeEvents(prevApp, new Set([eventId])));
  };''',
    r'''  const removeEvent = (eventId: string) => {
    if (!authUser || !db) return;
    updateApp((prevApp) => {
      const target = prevApp.events.find((event) => event.id === eventId);
      const ids = target?.sharedDailyId
        ? prevApp.events.filter((event) => event.sharedDailyId === target.sharedDailyId).map((event) => event.id)
        : [eventId];
      return removeEvents(prevApp, new Set(ids));
    });
  };''',
)
replace_all_checked(
    "src/App.tsx",
    r'''                onOpenTimeline={() => { setSelectedBabyTab("A"); setTimelineModalOpen(true); }}
                lastWeight={lastWeights.A}''',
    r'''                onOpenTimeline={() => { setSelectedBabyTab("A"); setTimelineModalOpen(true); }}
                onVoiceMessage={showVoiceMessage}
                lastWeight={lastWeights.A}''',
)
replace_all_checked(
    "src/App.tsx",
    r'''                onOpenTimeline={() => { setSelectedBabyTab("B"); setTimelineModalOpen(true); }}
                lastWeight={lastWeights.B}''',
    r'''                onOpenTimeline={() => { setSelectedBabyTab("B"); setTimelineModalOpen(true); }}
                onVoiceMessage={showVoiceMessage}
                lastWeight={lastWeights.B}''',
)

# 6) Remove the obsolete voice-pronunciation profile UI.
replace_once(
    "src/components/SettingsModal.tsx",
    r'''const parseVoiceAliases = (value: string) =>
  value
    .split(/[\s,、]+/)
    .map((alias) => alias.trim())
    .filter(Boolean);

''',
    "",
)
replace_once(
    "src/components/SettingsModal.tsx",
    r'''                      <div className="space-y-2">
                        <Label>音声入力名</Label>
                        <Input
                          value={(profile.voiceAliases ?? []).join(" ")}
                          onChange={(e) => handleProfileChange(babyId, "voiceAliases", parseVoiceAliases(e.target.value))}
                          placeholder="ひなた ひなちゃん"
                        />
                      </div>

''',
    "",
)

# 7) Shared daily report presentation: one row, both names, overlapping icons.
write(
    "src/components/DailyReportModal.tsx",
    r'''import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BabyId, BabyProfile, LogEvent } from "@/types";
import { fmtDate, fmtTime, iconGradients } from "@/lib/utils";
import { Baby } from "lucide-react";
import { useMemo, useState } from "react";

type DailyReportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: LogEvent[];
  profiles: Record<BabyId, BabyProfile>;
};

type FilterValue = "all" | BabyId;
type DailyReportItem = {
  key: string;
  event: LogEvent;
  babyIds: BabyId[];
};

const calcAgeLabel = (birthDate: string, at: Date) => {
  const birth = new Date(`${birthDate}T00:00:00`);
  const target = new Date(at);
  target.setHours(0, 0, 0, 0);
  if (target.getTime() < birth.getTime()) return "生後0か月0日";
  let months =
    (target.getFullYear() - birth.getFullYear()) * 12 +
    (target.getMonth() - birth.getMonth());
  let days = target.getDate() - birth.getDate();
  if (days < 0) {
    months -= 1;
    const lastDayPrevMonth = new Date(
      target.getFullYear(),
      target.getMonth(),
      0
    ).getDate();
    days = lastDayPrevMonth + days;
  }
  return `生後${months}か月${days}日`;
};

const uniqueBabyIds = (events: LogEvent[]) =>
  (["A", "B"] as BabyId[]).filter((babyId) => events.some((event) => event.babyId === babyId));

export function DailyReportModal({
  open,
  onOpenChange,
  events,
  profiles,
}: DailyReportModalProps) {
  const [filter, setFilter] = useState<FilterValue>("all");

  const reports = useMemo(() => {
    const dailyEvents = events
      .filter((event) => event.type === "daily")
      .sort((a, b) => b.timestamp - a.timestamp);
    const bySharedId = new Map<string, LogEvent[]>();
    dailyEvents.forEach((event) => {
      if (!event.sharedDailyId) return;
      const group = bySharedId.get(event.sharedDailyId) ?? [];
      group.push(event);
      bySharedId.set(event.sharedDailyId, group);
    });

    const seenSharedIds = new Set<string>();
    const items: DailyReportItem[] = [];
    dailyEvents.forEach((event) => {
      if (!event.sharedDailyId) {
        items.push({ key: event.id, event, babyIds: [event.babyId] });
        return;
      }
      if (seenSharedIds.has(event.sharedDailyId)) return;
      seenSharedIds.add(event.sharedDailyId);
      const group = bySharedId.get(event.sharedDailyId) ?? [event];
      items.push({
        key: `shared:${event.sharedDailyId}`,
        event,
        babyIds: uniqueBabyIds(group),
      });
    });

    if (filter === "all") return items;
    return items.filter((item) => item.babyIds.includes(filter));
  }, [events, filter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">
            一言日記
            <Select
              value={filter}
              onValueChange={(value) => setFilter(value as FilterValue)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="表示対象" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">両方</SelectItem>
                <SelectItem value="A">{profiles.A.displayName}</SelectItem>
                <SelectItem value="B">{profiles.B.displayName}</SelectItem>
              </SelectContent>
            </Select>
          </DialogTitle>
          <DialogDescription>
            一言日記を新しい順に表示します。
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto pr-2">
          {reports.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              日次レポートがありません。
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => {
                const firstBabyId = report.babyIds[0] ?? report.event.babyId;
                const firstProfile = profiles[firstBabyId];
                const createdAt = new Date(report.event.timestamp);
                const shared = report.babyIds.length > 1;
                const label = report.babyIds.map((babyId) => profiles[babyId].displayName).join(" & ");
                const firstGradient =
                  iconGradients.find((gradient) => gradient.value === firstProfile.iconGradient) ?? iconGradients[0];
                return (
                  <div
                    key={report.key}
                    className={`flex items-start gap-3 rounded-lg border p-4 ${shared ? "bg-card/80" : firstGradient.dimmedBgColor}`}
                  >
                    {shared ? (
                      <div className="relative h-12 w-16 flex-shrink-0" aria-label={`${label}の共通メモ`}>
                        {report.babyIds.map((babyId, index) => {
                          const profile = profiles[babyId];
                          const gradient =
                            iconGradients.find((option) => option.value === profile.iconGradient) ?? iconGradients[0];
                          return (
                            <div
                              key={babyId}
                              className={`absolute top-0 grid h-12 w-12 place-items-center rounded-full ring-2 ring-background ${gradient.bgColor}`}
                              style={{ left: `${index * 18}px`, zIndex: report.babyIds.length - index }}
                            >
                              {profile.iconEmoji ? (
                                <span className="text-xl">{profile.iconEmoji}</span>
                              ) : (
                                <Baby className="h-6 w-6 text-white" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={`grid h-12 w-12 flex-shrink-0 place-items-center rounded-full ${firstGradient.bgColor}`}>
                        {firstProfile.iconEmoji ? (
                          <span className="text-xl">{firstProfile.iconEmoji}</span>
                        ) : (
                          <Baby className="h-6 w-6 text-white" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{label || firstProfile.displayName}</span>
                        <span>{fmtDate(createdAt)} {fmtTime(createdAt)}</span>
                        <span>{calcAgeLabel(firstProfile.birthDate, createdAt)}</span>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm">
                        {report.event.note?.trim() || "（内容なし）"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
''',
)

# 8) Help copy follows the same targeting model and documents the memo mic.
replace_once(
    "src/components/HelpModal.tsx",
    r'''    {
      question: "2人へ同時に音声入力するには？",
      answer: "画面上部の「Twinly」を長押し、またはダブルタップします。赤ちゃんの名前を言わなければ、ミルク・おむつ・離乳食・睡眠などを2人へまとめて記録できます。",
    },''',
    r'''    {
      question: "2人へ同時に音声入力するには？",
      answer: "画面上部の「Twinly」を長押し、ダブルタップ、またはヘッダーのマイクから開始します。ここからの音声入力は常に2人が対象です。話の中に赤ちゃんの名前が入っていても、対象の切り替えには使いません。",
    },''',
)
replace_once(
    "src/components/HelpModal.tsx",
    r'''    {
      question: "音声入力が聞き取ってくれないときは？",
      answer: "マイク権限を確認し、短く区切って話すと認識しやすくなります。赤ちゃん1人だけに入れたい場合は、先にその子の名前タブから音声入力を始めるのが確実です。",
    },''',
    r'''    {
      question: "音声入力が聞き取ってくれないときは？",
      answer: "マイク権限を確認し、短く区切って話すと認識しやすくなります。赤ちゃん1人だけに入れたい場合は、その子の名前タブから音声入力を始めてください。",
    },
    {
      question: "一言メモを音声で入力するには？",
      answer: "一言メモ欄が空のときは保存ボタンがマイクになります。話した内容が入力欄に入るとチェックボタンに変わるので、内容を確認して保存してください。その赤ちゃん側のメモ欄から始めた場合は、その子のメモになります。",
    },''',
)
replace_once(
    "src/components/HelpModal.tsx",
    r'''    {
      question: "赤ちゃんの名前や音声で呼ぶ名前を変えたい",
      answer: "歯車の設定からプロフィールを開き、「表示名」「音声入力名」を変更できます。音声入力名は呼び方を複数登録できます。",
    },''',
    r'''    {
      question: "赤ちゃんの表示名を変えたい",
      answer: "歯車の設定からプロフィールを開き、「表示名」を変更できます。音声入力の対象は名前ではなく、開始した場所（赤ちゃんタブ／ヘッダー）で決まります。",
    },''',
)

# 9) Tutorial copy: remove pronunciation setup and explain location-based targeting + memo mic.
replace_once(
    "src/components/IntroTutorial.tsx",
    r'''    "今度は画面上部のTwinlyを長押し、またはダブルタップします。「10分前 おしっこ」と話してみてください。名前を言わなくても、同じ内容が2人へ同時に入ることと、相対時刻も一緒に指定できることを練習します。",''',
    r'''    "今度は画面上部のTwinlyを長押し、またはダブルタップします。「10分前 おしっこ」と話してみてください。ヘッダーから始めた音声入力は常に2人が対象です。話の中に赤ちゃんの名前が入っていても振り分けには使いません。",''',
)
replace_once(
    "src/components/IntroTutorial.tsx",
    r'''    "音声入力はミルクだけではありません。おむつ・離乳食・入眠・起床にも対応し、「30分前」「8時30分」のように時刻まで一緒に話せます。",''',
    r'''    "音声入力はミルクだけではありません。おむつ・離乳食・入眠・起床にも対応します。一言メモ欄は空のときマイクになり、話した内容が入るとチェックの保存ボタンに変わります。ヘッダーで普通の文章を話した場合は、2人の共通メモとして残せます。",''',
)
replace_once(
    "src/components/IntroTutorial.tsx",
    r'''    "設定では、2人の表示名・音声入力名・生年月日・アイコン・ミルクや睡眠の目安などを自分たちに合わせられます。最後にプロフィール設定を一度確認しておきましょう。",''',
    r'''    "設定では、2人の表示名・生年月日・アイコン・ミルクや睡眠の目安などを自分たちに合わせられます。音声入力の対象は名前の読み方ではなく、入力を始めた場所で決まります。最後にプロフィール設定を一度確認しておきましょう。",''',
)
replace_once(
    "src/components/IntroTutorial.tsx",
    r'''                  特に「表示名」「音声入力名」「生年月日」は最初に確認しておくのがおすすめです。''',
    r'''                  特に「表示名」「生年月日」「アイコン」は最初に確認しておくのがおすすめです。''',
)

# 10) Parser regression tests for the new targeting contract.
write(
    "src/lib/voice-command.target.test.ts",
    r'''import { describe, expect, it } from "vitest";
import { parseVoiceCommand } from "./voice-command";

const now = new Date("2026-09-13T15:00:00+09:00");

describe("voice command target ownership", () => {
  it("does not reroute a forced baby command when another baby's name is spoken", () => {
    expect(
      parseVoiceCommand("日向 ミルク180", {
        babyNames: { A: ["奏汰", "かなた"], B: ["日向", "ひなた"] },
        forcedBabyId: "A",
        now,
      })
    ).toMatchObject({
      ok: true,
      command: { babyId: "A", type: "milk", milkMl: 180 },
    });
  });

  it("keeps a spoken baby name in a plain header memo and targets both", () => {
    expect(
      parseVoiceCommand("奏汰 今日はお出かけに行ってきました", {
        babyNames: { A: ["奏汰", "かなた"], B: ["日向", "ひなた"] },
        forcedBabyId: "both",
        now,
      })
    ).toMatchObject({
      ok: true,
      command: {
        babyId: "both",
        type: "daily",
        dailyNote: "奏汰 今日はお出かけに行ってきました",
        fallbackMemo: true,
      },
    });
  });

  it("preserves text before the memo keyword for explicitly targeted common memos", () => {
    expect(
      parseVoiceCommand("日向 メモ 今日はよく笑った", {
        babyNames: { A: ["奏汰"], B: ["日向"] },
        forcedBabyId: "both",
        now,
      })
    ).toMatchObject({
      ok: true,
      command: {
        babyId: "both",
        type: "daily",
        dailyNote: "日向 今日はよく笑った",
      },
    });
  });
});
''',
)

# Remove the temporary migration plumbing so the final branch diff only contains product changes.
for temporary in [
    ROOT / "scripts/apply-voice-memo-redesign.py",
    ROOT / ".github/workflows/apply-voice-memo-redesign.yml",
]:
    if temporary.exists():
        temporary.unlink()

print("Voice/memo redesign applied successfully")
