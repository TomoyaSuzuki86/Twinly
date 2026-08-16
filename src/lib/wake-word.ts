const normalizeWakeWordText = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s、。,.!?！？・_\-]/g, "");

const TWINLY_WAKE_WORDS = [
  "ok twinly",
  "okay twinly",
  "ok ツインリー",
  "オーケー ツインリー",
  "オッケー ツインリー",
  "おーけー ついんりー",
  "おっけー ついんりー",
].map(normalizeWakeWordText);

export const containsTwinlyWakeWord = (text: string) => {
  const normalizedText = normalizeWakeWordText(text);
  return TWINLY_WAKE_WORDS.some((wakeWord) => normalizedText.includes(wakeWord));
};

export const findTwinlyWakeWord = (transcripts: string[]) =>
  transcripts.find((transcript) => containsTwinlyWakeWord(transcript)) ?? null;
