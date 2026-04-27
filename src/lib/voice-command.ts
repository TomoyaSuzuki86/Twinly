import { BabyId, BabyProfile, DiaperKind, LogEvent, MilkMethod } from "@/types";

export type VoiceCommandTarget = BabyId | "both";

export type VoiceCommand =
  | {
      kind: "event";
      babyId: VoiceCommandTarget;
      type: "milk";
      milkMl?: number;
      milkMlByBaby?: Partial<Record<BabyId, number>>;
      milkMethod: MilkMethod;
      timestamp: number;
      note: string;
    }
  | {
      kind: "event";
      babyId: VoiceCommandTarget;
      type: "diaper";
      diaperKind: DiaperKind;
      timestamp: number;
      note: string;
    };

export type VoiceCommandParseResult =
  | { ok: true; command: VoiceCommand }
  | { ok: false; reason: "missingBaby" | "missingType" | "missingMilkAmount"; normalizedText: string };

export type VoiceCommandParseOptions = {
  babyNames?: VoiceCommandBabyNames;
  defaultMilkMlByBaby?: Partial<Record<BabyId, number>>;
  now?: Date;
};

const toAsciiDigits = (value: string) => value.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10));

const normalizeText = (text: string) =>
  toAsciiDigits(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[、。,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const includesAny = (text: string, words: string[]) => words.some((word) => text.includes(normalizeText(word)));

export type VoiceCommandBabyNames = Partial<Record<BabyId, string[]>>;

const knownNameAliases: Record<string, string[]> = {
  奏汰: ["かなた", "カナタ"],
  日向: ["ひなた", "ヒナタ"],
};

const detectBabyId = (text: string, babyNames: VoiceCommandBabyNames = {}): BabyId | null => {
  const nameMatches = (["A", "B"] as BabyId[]).filter((babyId) =>
    (babyNames[babyId] ?? []).some((name) => {
      const normalizedName = normalizeText(name);
      return normalizedName.length > 0 && text.includes(normalizedName);
    })
  );

  if (nameMatches.length === 1) return nameMatches[0];

  const hasA =
    /(^|[^a-z])a([^a-z]|$)/.test(text) ||
    includesAny(text, ["赤ちゃんa", "aちゃん", "エー", "えー", "一人目", "1人目", "上の子"]);
  const hasB =
    /(^|[^a-z])b([^a-z]|$)/.test(text) ||
    includesAny(text, ["赤ちゃんb", "bちゃん", "ビー", "びー", "二人目", "2人目", "下の子"]);

  if (hasA && !hasB) return "A";
  if (hasB && !hasA) return "B";
  return null;
};

const detectMilkAmount = (text: string) => {
  const mlMatch = text.match(/(\d{1,4})\s*(?:ml|ミリ|みり)/);
  if (mlMatch) return Number(mlMatch[1]);

  const numberMatch = text.match(/\d{1,4}/);
  return numberMatch ? Number(numberMatch[0]) : null;
};

const detectDiaperKind = (text: string): DiaperKind => {
  const hasPee = includesAny(text, ["おしっこ", "しっこ", "尿", "pee"]);
  const hasPoop = includesAny(text, ["うんち", "ウンチ", "便", "poop"]);

  if (hasPee && hasPoop) return "mix";
  if (includesAny(text, ["両方", "両方とも", "mix"])) return "mix";
  if (hasPoop) return "poop";
  return "pee";
};

const detectTimestamp = (text: string, now: Date) => {
  const minuteAgoMatch = text.match(/(\d{1,3})\s*分前/);
  if (minuteAgoMatch) {
    const date = new Date(now);
    date.setMinutes(date.getMinutes() - Number(minuteAgoMatch[1]));
    return date.getTime();
  }

  const hourAgoMatch = text.match(/(\d{1,2})\s*時間前/);
  if (hourAgoMatch) {
    const date = new Date(now);
    date.setHours(date.getHours() - Number(hourAgoMatch[1]));
    return date.getTime();
  }

  const absoluteTimeMatch = text.match(/(\d{1,2})\s*(?:時|:)\s*(\d{1,2})?\s*(?:分)?/);
  if (absoluteTimeMatch) {
    const hour = Number(absoluteTimeMatch[1]);
    const minute = absoluteTimeMatch[2] ? Number(absoluteTimeMatch[2]) : 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      const date = new Date(now);
      date.setHours(hour, minute, 0, 0);
      return date.getTime();
    }
  }

  return undefined;
};

export const createVoiceCommandBabyNames = (profiles: Record<BabyId, BabyProfile>): VoiceCommandBabyNames => ({
  A: [profiles.A.displayName, ...(profiles.A.voiceAliases ?? []), ...(knownNameAliases[profiles.A.displayName] ?? [])],
  B: [profiles.B.displayName, ...(profiles.B.voiceAliases ?? []), ...(knownNameAliases[profiles.B.displayName] ?? [])],
});

export const parseVoiceCommand = (
  text: string,
  babyNamesOrOptions: VoiceCommandBabyNames | VoiceCommandParseOptions = {},
  legacyNow?: Date
): VoiceCommandParseResult => {
  const options: VoiceCommandParseOptions =
    "babyNames" in babyNamesOrOptions || "defaultMilkMlByBaby" in babyNamesOrOptions || "now" in babyNamesOrOptions
      ? babyNamesOrOptions
      : { babyNames: babyNamesOrOptions, now: legacyNow };
  const babyNames = options.babyNames ?? {};
  const now = options.now ?? new Date();
  const normalizedText = normalizeText(text);
  const babyId = detectBabyId(normalizedText, babyNames);
  const timestamp = detectTimestamp(normalizedText, now) ?? now.getTime();
  const targetBabyId: VoiceCommandTarget = babyId ?? "both";

  const isMilk = includesAny(normalizedText, ["ミルク", "授乳", "母乳", "哺乳", "milk"]);
  const isDiaper = includesAny(normalizedText, [
    "おむつ",
    "オムツ",
    "おしっこ",
    "しっこ",
    "うんち",
    "ウンチ",
    "尿",
    "便",
    "diaper",
    "pee",
    "poop",
  ]);

  if (isMilk) {
    const milkMl = detectMilkAmount(normalizedText);
    const defaultMilkMlByBaby = options.defaultMilkMlByBaby ?? {};
    const fallbackMilkMl = targetBabyId === "both" ? undefined : defaultMilkMlByBaby[targetBabyId];
    const milkMlByBaby =
      targetBabyId === "both" && !milkMl
        ? {
            A: defaultMilkMlByBaby.A,
            B: defaultMilkMlByBaby.B,
          }
        : undefined;
    const hasFallback =
      targetBabyId === "both"
        ? typeof milkMlByBaby?.A === "number" && typeof milkMlByBaby?.B === "number"
        : typeof fallbackMilkMl === "number";

    if (!milkMl && !hasFallback) return { ok: false, reason: "missingMilkAmount", normalizedText };

    return {
      ok: true,
      command: {
        kind: "event",
        babyId: targetBabyId,
        type: "milk",
        milkMl: milkMl ?? fallbackMilkMl,
        milkMlByBaby,
        milkMethod: includesAny(normalizedText, ["母乳", "breast"]) ? "breast" : "bottle",
        timestamp,
        note: `voice: ${text}`,
      },
    };
  }

  if (isDiaper) {
    return {
      ok: true,
      command: {
        kind: "event",
        babyId: targetBabyId,
        type: "diaper",
        diaperKind: detectDiaperKind(normalizedText),
        timestamp,
        note: `voice: ${text}`,
      },
    };
  }

  return { ok: false, reason: "missingType", normalizedText };
};

export const expandVoiceCommandTargets = (command: VoiceCommand): Array<VoiceCommand & { babyId: BabyId }> => {
  if (command.babyId !== "both") return [command as VoiceCommand & { babyId: BabyId }];
  return [
    { ...command, babyId: "A" },
    { ...command, babyId: "B" },
  ];
};

export const toVoiceLogPayload = (command: VoiceCommand & { babyId: BabyId }): Omit<LogEvent, "id" | "timestamp"> => {
  if (command.type === "milk") {
    const milkMl = command.milkMlByBaby?.[command.babyId] ?? command.milkMl;
    return {
      babyId: command.babyId,
      type: "milk",
      timestamp: command.timestamp,
      milkMl,
      milkMethod: command.milkMethod,
      note: command.note,
    };
  }

  return {
    babyId: command.babyId,
    type: "diaper",
    timestamp: command.timestamp,
    diaperKind: command.diaperKind,
    note: command.note,
  };
};
