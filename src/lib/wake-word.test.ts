import { describe, expect, it } from "vitest";
import { containsTwinlyWakeWord, findTwinlyWakeWord } from "./wake-word";

describe("Twinly wake word", () => {
  it.each([
    "ツインリーお願い",
    "ツインリー お願い",
    "ツインリーお願いします",
    "ツインリーをお願い",
    "ついんりー お願い",
    "Twinlyお願い",
    "OK Twinly",
    "okay twinly",
    "OK、ツインリー",
    "オーケー ツインリー",
    "おっけーついんりー",
  ])(
    "recognizes %s",
    (transcript) => {
      expect(containsTwinlyWakeWord(transcript)).toBe(true);
    }
  );

  it("recognizes the wake word inside a longer transcript", () => {
    expect(containsTwinlyWakeWord("ねえ、ツインリーお願い")).toBe(true);
  });

  it("does not react to an ordinary Twinly mention", () => {
    expect(containsTwinlyWakeWord("Twinlyを開いて")).toBe(false);
  });

  it("selects a matching speech-recognition alternative", () => {
    expect(findTwinlyWakeWord(["大きいツインリー", "ツインリーお願い"])).toBe("ツインリーお願い");
  });
});
