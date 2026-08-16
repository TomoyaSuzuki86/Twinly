const normalizeWakeWordText = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s、。,.!?！？・_\-]/g, "");

const TWINLY_WAKE_WORDS = [
  "ツインリーお願い",
  "ツインリーお願いします",
  "ツインリーをお願い",
  "ツインお願い",
  "ツインお願いします",
  "ツインをお願い",
  "ついんりーお願い",
  "ついんお願い",
  "Twinlyお願い",
].map(normalizeWakeWordText);

export const containsTwinlyWakeWord = (text: string) => {
  const normalizedText = normalizeWakeWordText(text);
  return TWINLY_WAKE_WORDS.some((wakeWord) => normalizedText.includes(wakeWord));
};

export const findTwinlyWakeWord = (transcripts: string[]) =>
  transcripts.find((transcript) => containsTwinlyWakeWord(transcript)) ?? null;
