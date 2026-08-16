const normalizeWakeWordText = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s、。,.!?！？・_\-]/g, "");

const HEY_VARIANTS = ["ヘイ", "へい", "ヘーイ", "へーい", "hey"];
const TWIN_VARIANTS = ["ツイン", "ついん", "twin"];
const HEARD_WAKE_WORD_VARIANTS = [
  "へーツイン",
  "へーツイ",
  "へいつい",
  "へーついー",
  "へついん",
  "へつい",
  "ペッチー",
  "ぺっちー",
];

const TWINLY_WAKE_WORDS = [
  ...HEY_VARIANTS.flatMap((hey) => TWIN_VARIANTS.map((twin) => `${hey}${twin}`)),
  ...HEARD_WAKE_WORD_VARIANTS,
].map(normalizeWakeWordText);

export const containsTwinlyWakeWord = (text: string) => {
  const normalizedText = normalizeWakeWordText(text);
  return TWINLY_WAKE_WORDS.some((wakeWord) => normalizedText.includes(wakeWord));
};

export const findTwinlyWakeWord = (transcripts: string[]) =>
  transcripts.find((transcript) => containsTwinlyWakeWord(transcript)) ?? null;
