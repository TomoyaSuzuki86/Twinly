import { BabyId, BabyProfile, DiaperKind, LogEvent } from "@/types";

export type VoiceCommandTarget = BabyId | "both";

export type VoiceCommand =
  | {
      kind: "event";
      babyId: VoiceCommandTarget;
      type: "milk";
      milkMl?: number;
      milkMlByBaby?: Partial<Record<BabyId, number>>;
      timestamp: number;
      note: string;
    }
  | {
      kind: "event";
      babyId: VoiceCommandTarget;
      type: "solidFood";
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
    }
  | {
      kind: "event";
      babyId: VoiceCommandTarget;
      type: "sleepStart" | "wake";
      timestamp: number;
      note: string;
    }
  | {
      kind: "event";
      babyId: BabyId;
      type: "daily";
      dailyNote: string;
      timestamp: number;
      note: string;
    }
  | {
      kind: "event";
      babyId: BabyId;
      type: "temperature";
      temperature: number;
      timestamp: number;
      note: string;
    }
  | {
      kind: "event";
      babyId: BabyId;
      type: "weight";
      weight: number;
      timestamp: number;
      note: string;
    }
  | {
      kind: "event";
      babyId: BabyId;
      type: "height";
      height: number;
      timestamp: number;
      note: string;
    };

export type VoiceCommandParseResult =
  | { ok: true; command: VoiceCommand }
  | { ok: false; reason: "missingBaby" | "missingType" | "missingMilkAmount"; normalizedText: string };

export type VoiceCommandParseOptions = {
  babyNames?: VoiceCommandBabyNames;
  defaultMilkMlByBaby?: Partial<Record<BabyId, number>>;
  forcedBabyId?: BabyId;
  now?: Date;
};

const toAsciiDigits = (value: string) => value.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10));

const speechTextReplacements: Array<[RegExp, string]> = [
  [/彼方|奏汰|奏太|奏多|金田|加奈多/g, "かなた"],
  [/日向|日なた/g, "ひなた"],
];

const normalizeKnownSpeechText = (text: string) =>
  speechTextReplacements.reduce((normalized, [pattern, replacement]) => normalized.replace(pattern, replacement), text);

const normalizeText = (text: string) =>
  normalizeKnownSpeechText(toAsciiDigits(text))
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
  const kanjiNumberPattern = "\u3007\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343";
  const parseKanjiNumber = (value: string) => {
    const digits: Record<string, number> = {
      "\u3007": 0,
      "\u96f6": 0,
      "\u4e00": 1,
      "\u4e8c": 2,
      "\u4e09": 3,
      "\u56db": 4,
      "\u4e94": 5,
      "\u516d": 6,
      "\u4e03": 7,
      "\u516b": 8,
      "\u4e5d": 9,
    };
    const units: Record<string, number> = {
      "\u5341": 10,
      "\u767e": 100,
      "\u5343": 1000,
    };

    if ([...value].every((char) => char in digits)) {
      return Number([...value].map((char) => digits[char]).join(""));
    }

    let total = 0;
    let current = 0;
    for (const char of value) {
      if (char in digits) {
        current = digits[char];
        continue;
      }
      if (char in units) {
        total += (current || 1) * units[char];
        current = 0;
      }
    }

    const parsed = total + current;
    return parsed > 0 ? parsed : null;
  };

  const mlMatch = text.match(new RegExp(`(\\d{1,4}|[${kanjiNumberPattern}]+)\\s*(?:ml|\\u30df\\u30ea|\\u307f\\u308a)`));
  if (mlMatch) {
    return /^\d+$/.test(mlMatch[1]) ? Number(mlMatch[1]) : parseKanjiNumber(mlMatch[1]);
  }

  const textWithoutTimeExpressions = text
    .replace(/\d{1,2}\s*(?:\u6642|:|\uff1a)\s*\d{0,2}\s*(?:\u5206)?/g, " ")
    .replace(/\d{1,3}\s*(?:\u5206\u524d)/g, " ")
    .replace(/\d{1,2}\s*(?:\u6642\u9593\u524d)/g, " ")
    .replace(new RegExp(`[${kanjiNumberPattern}]+\\s*\\u6642\\s*[${kanjiNumberPattern}]*\\s*(?:\\u5206)?`, "g"), " ")
    .replace(new RegExp(`[${kanjiNumberPattern}]+\\s*(?:\\u5206\\u524d|\\u6642\\u9593\\u524d)`, "g"), " ");

  const numberMatch = textWithoutTimeExpressions.match(/\d{1,4}/);
  if (numberMatch) return Number(numberMatch[0]);

  const kanjiNumberMatch = textWithoutTimeExpressions.match(new RegExp(`[${kanjiNumberPattern}]+`));
  return kanjiNumberMatch ? parseKanjiNumber(kanjiNumberMatch[0]) : null;
};

const detectDiaperKind = (text: string): DiaperKind => {
  const hasPee = includesAny(text, ["おしっこ", "しっこ", "尿", "pee"]);
  const hasPoop = includesAny(text, ["うんち", "ウンチ", "うんこ", "ウンコ", "便", "poop"]);

  if (hasPee && hasPoop) return "mix";
  if (includesAny(text, ["両方", "両方とも", "mix"])) return "mix";
  if (hasPoop) return "poop";
  return "pee";
};

const detectDecimalNumber = (text: string) => {
  const decimalMatch = text.match(/\d+(?:\.\d+)?/);
  return decimalMatch ? Number(decimalMatch[0]) : null;
};

const detectTemperature = (text: string) => {
  const degreeMatch = text.match(/(\d{2})\s*度\s*(\d)?/);
  if (degreeMatch) {
    return Number(`${degreeMatch[1]}.${degreeMatch[2] ?? 0}`);
  }

  return detectDecimalNumber(text);
};

const detectDailyNote = (originalText: string) => {
  const match = originalText.match(/(?:ひとこと|一言|めも|メモ)(?:は|を|:|：)?\s*(.+)$/i);
  return match?.[1]?.trim() || originalText.trim();
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
    "babyNames" in babyNamesOrOptions ||
    "defaultMilkMlByBaby" in babyNamesOrOptions ||
    "forcedBabyId" in babyNamesOrOptions ||
    "now" in babyNamesOrOptions
      ? babyNamesOrOptions
      : { babyNames: babyNamesOrOptions, now: legacyNow };
  const babyNames = options.babyNames ?? {};
  const now = options.now ?? new Date();
  const normalizedText = normalizeText(text);
  const babyId = options.forcedBabyId ?? detectBabyId(normalizedText, babyNames);
  const timestamp = detectTimestamp(normalizedText, now) ?? now.getTime();
  const targetBabyId: VoiceCommandTarget = babyId ?? "both";

  const isDailyNote = includesAny(normalizedText, ["ひとこと", "一言", "めも", "メモ"]);
  const isTemperature = includesAny(normalizedText, ["体温", "熱"]);
  const isWeight = includesAny(normalizedText, ["体重"]);
  const isHeight = includesAny(normalizedText, ["身長", "慎重"]);
  const isSolidFood = includesAny(normalizedText, ["離乳食", "ごはん", "おかゆ", "お粥"]);
  const isMilk = includesAny(normalizedText, ["ミルク", "授乳", "母乳", "哺乳", "milk"]);
  const isDiaper = includesAny(normalizedText, [
    "おむつ",
    "オムツ",
    "おしっこ",
    "しっこ",
    "うんち",
    "ウンチ",
    "うんこ",
    "ウンコ",
    "尿",
    "便",
    "diaper",
    "pee",
    "poop",
  ]);
  const isWake = includesAny(normalizedText, ["起床", "起きました", "起きた", "覚醒", "おはよう"]);
  const isSleepStart = includesAny(normalizedText, ["入眠", "寝ました", "寝た", "お休み", "おやすみ"]);

  if (isDailyNote) {
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
  }

  if (isTemperature) {
    if (!babyId) return { ok: false, reason: "missingBaby", normalizedText };
    const temperature = detectTemperature(text);
    if (!temperature) return { ok: false, reason: "missingType", normalizedText };

    return {
      ok: true,
      command: {
        kind: "event",
        babyId,
        type: "temperature",
        temperature,
        timestamp,
        note: `voice: ${text}`,
      },
    };
  }

  if (isWeight) {
    if (!babyId) return { ok: false, reason: "missingBaby", normalizedText };
    const weight = detectDecimalNumber(text);
    if (!weight) return { ok: false, reason: "missingType", normalizedText };

    return {
      ok: true,
      command: {
        kind: "event",
        babyId,
        type: "weight",
        weight,
        timestamp,
        note: `voice: ${text}`,
      },
    };
  }

  if (isHeight) {
    if (!babyId) return { ok: false, reason: "missingBaby", normalizedText };
    const height = detectDecimalNumber(text);
    if (!height) return { ok: false, reason: "missingType", normalizedText };

    return {
      ok: true,
      command: {
        kind: "event",
        babyId,
        type: "height",
        height,
        timestamp,
        note: `voice: ${text}`,
      },
    };
  }

  if (isWake || isSleepStart) {
    return {
      ok: true,
      command: {
        kind: "event",
        babyId: targetBabyId,
        type: isWake ? "wake" : "sleepStart",
        timestamp,
        note: `voice: ${text}`,
      },
    };
  }

  if (isSolidFood) {
    return {
      ok: true,
      command: {
        kind: "event",
        babyId: targetBabyId,
        type: "solidFood",
        timestamp,
        note: text.trim(),
      },
    };
  }

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

export const selectVoiceCommandFromAlternatives = (
  transcripts: string[],
  options: VoiceCommandParseOptions = {}
): VoiceCommandParseResult => {
  const uniqueTranscripts = transcripts.map((transcript) => transcript.trim()).filter(Boolean);
  const parsedResults = [...new Set(uniqueTranscripts)].map((transcript) => parseVoiceCommand(transcript, options));

  const namedMatch = parsedResults.find(
    (result) => result.ok && result.command.babyId !== "both"
  );
  if (namedMatch) return namedMatch;

  const anyMatch = parsedResults.find((result) => result.ok);
  if (anyMatch) return anyMatch;

  return parsedResults[0] ?? { ok: false, reason: "missingType", normalizedText: "" };
};

export const expandVoiceCommandTargets = (command: VoiceCommand): Array<VoiceCommand & { babyId: BabyId }> => {
  if (command.babyId !== "both") return [command as VoiceCommand & { babyId: BabyId }];
  return [
    { ...command, babyId: "A" },
    { ...command, babyId: "B" },
  ];
};

export const toVoiceLogPayload = (command: VoiceCommand & { babyId: BabyId }): Omit<LogEvent, "id"> => {
  if (command.type === "milk") {
    const milkMl = command.milkMlByBaby?.[command.babyId] ?? command.milkMl;
    return {
      babyId: command.babyId,
      type: "milk",
      timestamp: command.timestamp,
      milkMl,
      note: command.note,
    };
  }

  if (command.type === "solidFood") {
    return {
      babyId: command.babyId,
      type: "solidFood",
      timestamp: command.timestamp,
      note: command.note,
    };
  }

  if (command.type === "sleepStart" || command.type === "wake") {
    return {
      babyId: command.babyId,
      type: command.type,
      timestamp: command.timestamp,
      note: command.note,
    };
  }

  if (command.type === "daily") {
    return {
      babyId: command.babyId,
      type: "daily",
      timestamp: command.timestamp,
      note: command.dailyNote,
    };
  }

  if (command.type === "temperature") {
    return {
      babyId: command.babyId,
      type: "temperature",
      timestamp: command.timestamp,
      temperature: command.temperature,
      note: command.note,
    };
  }

  if (command.type === "weight") {
    return {
      babyId: command.babyId,
      type: "weight",
      timestamp: command.timestamp,
      weight: command.weight,
      note: command.note,
    };
  }

  if (command.type === "height") {
    return {
      babyId: command.babyId,
      type: "height",
      timestamp: command.timestamp,
      height: command.height,
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
