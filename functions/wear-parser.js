const toAsciiDigits = (value) =>
  String(value).replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10));

const normalizeKnownSpeechText = (text) =>
  String(text || "")
    .replace(/彼方|奏汰|奏太|奏多|金田|加奈多/g, "かなた")
    .replace(/日向|日なた/g, "ひなた");

const normalizeVoiceText = (text) =>
  normalizeKnownSpeechText(toAsciiDigits(text))
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[、。,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const includesAny = (text, words) => words.some((word) => text.includes(normalizeVoiceText(word)));

const knownNameAliases = {
  "奏汰": ["かなた", "カナタ"],
  "日向": ["ひなた", "ヒナタ"],
};

const detectTimestamp = (text, now = new Date()) => {
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

const parseKanjiNumber = (value) => {
  const digits = { "〇":0, "零":0, "一":1, "二":2, "三":3, "四":4, "五":5, "六":6, "七":7, "八":8, "九":9 };
  const units = { "十":10, "百":100, "千":1000 };
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

const detectMilkAmount = (text) => {
  const kanjiNumberPattern = "〇零一二三四五六七八九十百千";
  const mlMatch = text.match(new RegExp(`(\\d{1,4}|[${kanjiNumberPattern}]+)\\s*(?:ml|ミリ|みり)`));
  if (mlMatch) return /^\d+$/.test(mlMatch[1]) ? Number(mlMatch[1]) : parseKanjiNumber(mlMatch[1]);

  const textWithoutTimeExpressions = text
    .replace(/\d{1,2}\s*(?:時|:|：)\s*\d{0,2}\s*(?:分)?/g, " ")
    .replace(/\d{1,3}\s*(?:分前)/g, " ")
    .replace(/\d{1,2}\s*(?:時間前)/g, " ")
    .replace(new RegExp(`[${kanjiNumberPattern}]+\\s*時\\s*[${kanjiNumberPattern}]*\\s*(?:分)?`, "g"), " ")
    .replace(new RegExp(`[${kanjiNumberPattern}]+\\s*(?:分前|時間前)`, "g"), " ");

  const numberMatch = textWithoutTimeExpressions.match(/\d{1,4}/);
  if (numberMatch) return Number(numberMatch[0]);
  const kanjiNumberMatch = textWithoutTimeExpressions.match(new RegExp(`[${kanjiNumberPattern}]+`));
  return kanjiNumberMatch ? parseKanjiNumber(kanjiNumberMatch[0]) : null;
};

const parseVoiceTextWithRules = ({
  text,
  profiles,
  defaultMilkMlByBaby = {},
  forcedBabyId,
  now = new Date(),
}) => {
  const normalizedText = normalizeVoiceText(text);
  const babies = ["A", "B"];
  const babyId = forcedBabyId || babies.find((id) => {
    const profile = profiles?.[id] || {};
    const names = [
      profile.displayName,
      ...(profile.voiceAliases || []),
      ...(knownNameAliases[profile.displayName] || []),
      id,
    ].filter(Boolean);
    return names.some((name) => normalizedText.includes(normalizeVoiceText(name)));
  });
  const targetBabyId = babyId || "both";
  const isMilk = includesAny(normalizedText, ["ミルク", "授乳", "母乳", "哺乳", "milk"]);
  const isDiaper = includesAny(normalizedText, ["おむつ", "オムツ", "おしっこ", "しっこ", "うんち", "うんこ", "尿", "便"]);
  const timestamp = detectTimestamp(normalizedText, now);

  if (isMilk) {
    const detectedMilkMl = detectMilkAmount(normalizedText);
    const milkMl = detectedMilkMl || (targetBabyId === "both" ? undefined : defaultMilkMlByBaby[targetBabyId]);
    const milkMlByBaby = targetBabyId === "both" && !detectedMilkMl
      ? { A: defaultMilkMlByBaby.A, B: defaultMilkMlByBaby.B }
      : undefined;
    const hasFallback = targetBabyId === "both"
      ? typeof milkMlByBaby?.A === "number" && typeof milkMlByBaby?.B === "number"
      : typeof milkMl === "number";
    if (!detectedMilkMl && !hasFallback) return null;
    return {
      babyId: targetBabyId,
      type: "milk",
      timestamp,
      milkMl,
      milkMlByBaby,
      milkMethod: includesAny(normalizedText, ["母乳", "breast"]) ? "breast" : "bottle",
    };
  }

  if (isDiaper) {
    const hasPee = includesAny(normalizedText, ["おしっこ", "しっこ", "尿"]);
    const hasPoop = includesAny(normalizedText, ["うんち", "うんこ", "便"]);
    return {
      babyId: targetBabyId,
      type: "diaper",
      timestamp,
      diaperKind: hasPee && hasPoop ? "mix" : hasPoop ? "poop" : "pee",
    };
  }

  return null;
};

const projectWearEvents = ({
  uid,
  transcript,
  parsed,
  idFactory,
  nowMs = Date.now(),
}) => {
  const timestamp = typeof parsed.timestamp === "number" && Number.isFinite(parsed.timestamp)
    ? parsed.timestamp
    : nowMs;
  const babyIds = parsed.babyId === "both" ? ["A", "B"] : [parsed.babyId];

  return babyIds.map((babyId) => {
    const event = {
      id: idFactory(),
      babyId,
      type: parsed.type,
      timestamp,
      note: `wear: ${transcript}`,
      createdByUid: uid,
      updatedByUid: uid,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (parsed.type === "milk") {
      event.milkMl = parsed.milkMlByBaby?.[babyId] || parsed.milkMl;
      event.milkMethod = parsed.milkMethod || "bottle";
    } else {
      event.diaperKind = parsed.diaperKind || "pee";
    }
    return event;
  });
};

module.exports = {
  normalizeVoiceText,
  detectTimestamp,
  detectMilkAmount,
  parseVoiceTextWithRules,
  projectWearEvents,
};
